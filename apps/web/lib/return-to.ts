/**
 * The only post-authentication destination this app accepts from a query
 * string. Keeping this narrow avoids turning an innocent `returnTo` parameter
 * into an open redirect and lets the invitation page be the sole owner of its
 * token-shaped paths.
 */
export function invitationReturnTo(value: string | undefined): string | null {
  if (!value) return null

  return /^\/invite\/[A-Za-z0-9_-]{32,128}$/.test(value) ? value : null
}

/** Extracts the opaque invitation token after `invitationReturnTo` accepted it. */
export function invitationTokenFromReturnTo(returnTo: string): string {
  return returnTo.slice('/invite/'.length)
}

/**
 * The same allowlist, applied to whatever a person actually pastes.
 *
 * An invitation reaches someone as a whole URL in a chat message, so asking
 * them to strip the origin off it before pasting would be asking them to do
 * the parsing. Both forms land here and both come out as a path this app is
 * willing to navigate to, or null.
 *
 * A foreign origin is not rejected, and that is deliberate rather than an
 * oversight: only the path survives, and the navigation is always relative to
 * this install. Someone pasting `https://someone-elses-host/invite/TOKEN` gets
 * that token tried against THIS install, where it will simply not exist. The
 * origin was never the secret; the token is.
 */
export function invitationPathFrom(pasted: string): string | null {
  const trimmed = pasted.trim()
  if (!trimmed) return null

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return invitationReturnTo(new URL(trimmed).pathname)
    } catch {
      return null
    }
  }

  return invitationReturnTo(trimmed)
}
