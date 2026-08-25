import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { organization } from 'better-auth/plugins'
import { sql } from 'drizzle-orm'

import { db, hasPendingInvitationForEmail, schema } from '@claimfold/db'

import { assertAppUrl, isSecureOrigin, readAppUrl } from './app-url.ts'
import { readAuthSecret } from './auth-secret.ts'

/**
 * Authentication.
 *
 * Better Auth is self-hostable with no external service, which matters for a
 * product buyers run themselves — a dependency on a hosted auth provider would
 * make every install depend on someone else's uptime and pricing.
 *
 * Password hashing (argon2id), session rotation and CSRF are handled by the
 * library. What we own is the mapping from session → organization, which is
 * the hinge the entire row-level-security scheme turns on. See ./session.ts.
 */

// Refuses to serve on a mismatched port or an http:// production origin,
// rather than failing later at the OAuth redirect or silently dropping
// `Secure` from the session cookie. See ./app-url.ts.
assertAppUrl()

const APP_URL = readAppUrl()

/**
 * True when the browser reaches this install over TLS.
 *
 * Not the same as `APP_URL.startsWith('https://')`, which is what this used to
 * be: an install behind a TLS-terminating proxy is served over https while
 * `APP_URL` may legitimately say http. `TRUST_PROXY=true` covers that case.
 */
const isHttps = isSecureOrigin()

/**
 * Whether a stranger may create an account.
 *
 * Registration was open. The sign-in page carried a "Create one" link, the
 * endpoint behind it was reachable by anyone who could reach the instance, and
 * each signup minted its own organization. Row-level security meant they could
 * not read the operator's data — so this was never a disclosure bug — but a
 * self-hosted tool for one person should not let the internet enrol itself.
 *
 * First user wins. A fresh install has to let *somebody* in, and that somebody
 * is whoever gets there first; after that the door is shut unless the operator
 * opens it deliberately with `ALLOW_SIGNUP=true`, which is what a second seat
 * or a team install needs.
 *
 * The race between two simultaneous first signups is real and not worth
 * closing: the window is milliseconds on a box nobody knows about yet, and the
 * loser gets an account rather than the operator's data.
 */
export async function signupAllowed(): Promise<boolean> {
  if (process.env.ALLOW_SIGNUP === 'true') return true

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.user)
    .limit(1)

  return (row?.count ?? 0) === 0
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
    },
  }),

  secret: readAuthSecret(),
  baseURL: APP_URL,

  emailAndPassword: {
    enabled: true,
    // No email delivery configured on a fresh self-hosted install, and an
    // operator locked out of their own box by an unsendable verification mail
    // is a bad first impression. Revisit when SMTP is part of setup.
    requireEmailVerification: false,
    minPasswordLength: 12,
  },

  /**
   * Rate limiting, on by default rather than only in production.
   *
   * There was none. A self-hosted dashboard is reachable from the internet by
   * definition — that is what the operator bought — and unlimited password
   * attempts against it is the cheapest attack there is. The generous global
   * ceiling is for a dashboard someone is actively using; the tight rules
   * below are for the endpoints where a high rate is never legitimate.
   *
   * Enabled in development too, deliberately: a protection that only exists in
   * production is one nobody has ever seen work.
   *
   * Storage is in-memory, which is correct for the single-container install
   * this ships as. Running more than one web replica needs this moved to the
   * database — better-auth supports it, and the limit silently becoming
   * per-replica is the failure mode to watch for.
   */
  rateLimit: {
    enabled: true,
    window: 60,
    max: 120,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 60 * 60, max: 3 },
      '/forget-password': { window: 60 * 60, max: 3 },
      '/reset-password': { window: 60 * 60, max: 5 },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    /*
      The cookie cache trades a database lookup per request for a window where
      a revoked session still works. That window was five minutes — and
      `changePasswordAction` passes `revokeOtherSessions: true` precisely
      because the user believes a session is stolen, so five minutes is five
      minutes too long for the one case the feature exists to serve.

      Thirty seconds keeps almost all of the saving (a page load is many
      requests, a person is not) while making revocation effectively immediate
      from the user's point of view.
    */
    cookieCache: { enabled: true, maxAge: 30 },
  },

  advanced: {
    /*
      `secure` is derived from APP_URL rather than left to a library default.
      It was absent, and the difference it makes is whether the session cookie
      is allowed to travel over plain http — so it is not a flag to infer. Tied
      to the configured URL rather than hardcoded because `npm run dev` on
      http://localhost would otherwise never receive a cookie at all.
    */
    useSecureCookies: isHttps,
    // Same-site is sufficient: the dashboard is not embedded anywhere, and
    // 'lax' keeps the OAuth return from Instagram working.
    defaultCookieAttributes: { sameSite: 'lax', httpOnly: true, secure: isHttps },
  },

  /*
    Enforced here rather than by hiding the link, because the endpoint is what
    an attacker talks to. The sign-in page also hides the toggle when this
    would refuse, so the UI does not advertise a door that is locked — but that
    is courtesy, and this is the control.
  */
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (await signupAllowed()) return
          if (await hasPendingInvitationForEmail(user.email)) return
          throw new APIError('FORBIDDEN', {
            message:
              'This install is not accepting new accounts. Use the invitation link you received, or ask the operator to allow sign-up.',
          })
        },
      },
    },
  },

  plugins: [
    organization({
      // A personal workspace on signup, so a new install has somewhere for
      // posts to live before anyone thinks about teams.
      allowUserToCreateOrganization: true,
      organizationLimit: 10,
      creatorRole: 'owner',
    }),
  ],
})

export type Auth = typeof auth
