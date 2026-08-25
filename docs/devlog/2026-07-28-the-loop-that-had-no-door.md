# The loop that had no door

*2026-07-28 — a review, five fixes, 38 tests, and a new name.*

The invitation flow shipped last session was good work. Redemption was an
explicit click rather than a side effect of opening a URL, so a link preview
could not spend somebody's membership token. The email match was
case-insensitive. The whole thing sat in one transaction so the membership
insert and the status flip could not disagree.

It also had a door that only opened one way.

## Signing up is not joining

An invitee's workspace comes from their invitation, so sign-up deliberately
creates none. That is correct. What follows from it is not obvious: between
creating the account and redeeming the invitation there is a window in which a
person has a real session and belongs to nothing at all.

Close the tab there. Or let the token expire while you are reading the email.
Or have the operator revoke it. Now go back to the dashboard.

`getActiveSession` returned `null` — the same `null` it returns for a stranger
— so `requireSession` sent you to `/sign-in`. Signing in worked. It returned
you to `/`. Which sent you to `/sign-in`.

Nothing was broken. Every function did exactly what it said. The bug lived in
the gap between two of them, in a value that meant two different things and was
only ever read as one.

The same door catches the operator. On a fresh install the first user creates
their workspace in a second call after sign-up; anything that interrupts
between the two locks them out of their own box. And it catches anyone removed
from the workspace they had active, because `getActiveSession` refuses — quite
rightly — to silently drop them into a different tenant, but then had nowhere
to put them.

So `SessionState` now has three cases instead of two, and the middle one has a
page. `/no-workspace` says which of the two situations you are in and offers
the three ways out: paste the invitation link, start a workspace, or sign out.

It was verified the only way this kind of thing can be: by making an account
with no membership and watching `/` land somewhere that was not `/sign-in`.

## Two checks that had already drifted

The settings screen reads two addresses side by side and asks the same question
of both — can something outside this machine fetch this? They were two separate
copies of the same private-range list, and the copies had come apart. The
app-URL check knew about `172.16/12`; the asset check did not.

`172.16/12` is Docker's default bridge. It is the private address an operator
is most likely to paste in without noticing, on the deployment shape this
product actually ships as. One panel could show the same address green and red
at the same time.

Both now call `describePublicUrl`, which also learned about link-local
`169.254/16` — and with it the cloud metadata endpoint — and which matches
`URL.hostname` instead of running a pattern over the whole URL string. The old
approach condemned `https://cdn.example.com/10.0.1/` as private.

## A credential in a query string

Creating an invitation redirected to `/members?invite=https://…/invite/<token>`.

The comment above it was proud of the right thing: shown once, never stored
anywhere retrievable, because a link you can re-read is a link that outlives
the reason for it. All true, and all undone by the URL it travelled in.
Browser history keeps it. So does the access log of whatever reverse proxy is
terminating TLS — which is the documented deployment, so not a hypothetical
log. The token is a bearer credential with a seven-day life.

It comes back through the action's return value now.

## Tests for the part that had none

Fifteen for invitation redemption. The email-match refusal, the expiry
boundary, the already-a-member path, the single-use guarantee — the four
behaviours that make the flow safe rather than merely present — had no test at
all. The one test that existed asserted that a query parameter is shaped like
an invitation path, which is a string function.

Seventeen more for the measure stage, which had zero coverage and a specific
reason to be nervous about it: nothing in that file can run until a post has
actually been published to Instagram, and that has never happened. Every bug in
it is still in it.

Those seventeen were mutated to see whether they bite. Forcing the candidate
scan to UTC failed five. Reverting the write to `new Date()` — the exact
two-clock bug the file's own comments describe, where a sweep crossing midnight
checked one day and wrote another — failed precisely the one test written for
it. A test that has never seen the bug it describes is a hypothesis.

## Niche fit, measured

The ranking has a fit component the previous session had suspected was doing
nothing. Twenty realistic German Wikipedia titles against the shipped preset:
**sixteen scored exactly 0.00**. The four that scored were the four whose
titles literally repeat a seed word — Kartografie, Astronomie, Etymologie,
Mythologie. Every proper noun scored zero, and a pageview ranking is mostly
proper nouns.

The scoring was left alone. What changed is that the number is now written down
next to the threshold that depends on it, with the warning that the threshold
must not be lowered to compensate. A threshold tuned until the list looks full
has stopped meaning anything.

## And a name

Slidesmith became **Claimfold**. *Claim* is the product's atomic unit — the
pipeline researches claims, the gate blocks on claims, the record lists them.
*Fold* is a printing term and matches a carousel. Neither word asserts anything
about accuracy, which the wording rule forbids and which rules out every
obvious alternative.

npm, the GitHub organisation and all three domains were free. So was the DPMA
register, across national, EU and international marks. 137 files, three
casings, the package scope, the Postgres role, and every ADR.

The folder is still called `slidesmith`. So is the dev database's seed user.
Both were left deliberately: one is the working directory, and the other makes
the credential comment in `.env` true. Renaming things is easy; noticing what a
rename quietly makes wrong is the part worth writing down.
