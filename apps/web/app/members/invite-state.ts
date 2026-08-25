/**
 * What the invite form renders after a submission.
 *
 * In its own module because `actions.ts` carries `'use server'`, and every
 * export of such a module is turned into a callable server reference. A type
 * has nothing to reference, so it does not belong there.
 *
 * A returned value rather than a redirect, and that is the whole point of the
 * shape. The link used to travel back as `/members?invite=https://…/invite/
 * <token>`, which put a bearer credential — anyone holding it joins the
 * workspace at the invited role — into the browser's history and into the
 * access log of whatever reverse proxy is terminating TLS. That is the
 * documented deployment, so it was not a hypothetical log.
 *
 * Returning it keeps the "shown once, never retrievable" property the copy
 * field was built for, and now the property is actually true.
 */
export interface InviteFormState {
  error?: string
  link?: string
}
