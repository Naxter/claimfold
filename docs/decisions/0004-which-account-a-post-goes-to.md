# 4. A channel belongs to an account

Date: 2026-07-26
Status: accepted

## Context

`posts.igAccountId` has existed since the first migration. The publish worker
reads it twice. **Nothing has ever written it.**

The consequence is not a missing feature, it is a silent loop. `loadContext`
returns null when the column is null, `publishPost` returns
`{status: 'failed', detail: 'Post or account missing'}` — and returns *without
writing anything to the database*. The post stays `scheduled`, `findDuePosts`
selects it again on the next tick, and that repeats forever. Nothing publishes,
nothing fails visibly, and the dashboard says nothing at all.

Every piece around it works: the OAuth connect flow stores accounts, the refresh
cron keeps tokens alive, the renderer produces publishable JPEGs, the publishing
client handles carousels and first comments. The link from an account to a post
was never built. Same shape as
[the button that went nowhere](docs/devlog/2026-07-26-the-button-that-went-nowhere.md).

So: where does a post learn which account it publishes to?

## The options

**An "active account" switch.** Register several, pick one as current, new posts
attach to it.

Rejected, and it is the most dangerous of the three. It is global mutable state
that silently changes what a button does. Set it on Monday, forget by Thursday,
and the next approval goes to an audience you did not intend — under the
customer's real name. `publish-job.ts` already argues this exact point in its own
comment, which is why it refuses to guess an account rather than falling back to
`LIMIT 1`. Nothing on the review screen would remind anyone which way the switch
was flipped, and the failure is not recoverable by apology. It also gets more
dangerous the more useful it becomes: with one account the switch is pointless,
with several it is a loaded gun.

**A selector when creating a post.** Honest — the choice is visible where it is
made — but wrong twice over.

It asks the same question twice. You already choose a channel when you create a
post, and a German knowledge channel does not publish to an English cooking
account. And because the two are chosen separately they can disagree: nothing
would stop someone picking the German channel and the English account, producing
slides watermarked with one handle published to another. Two sources of truth for
"whose channel is this".

## Decision

**The account belongs to the channel.** `niches.igAccountId`.

This is not a new concept, it is finishing one. A channel already owns the two
things that only make sense per account:

- `watermark`, whose own comment says "usually the account handle"
- `cadence` — posts per week, preferred times, timezone — which is a *publishing
  schedule*

A channel was already three-quarters of an account's identity. The account itself
was the missing quarter.

Switching accounts is therefore choosing a channel, which the create form already
asks. And wanting one channel on two accounts is what duplicating a channel is
for.

**Cardinality is many-to-one.** Several channels may share an account — two
series on one handle is a reasonable thing to run — and a channel has exactly one
account.

### The account is copied onto the post, not looked up through it

`posts.igAccountId` stays, and is set when the post is created.

Reading it through `nicheId` at publish time would be less code and wrong.
Repointing a channel at a different account later would silently rewrite where
every past post claims to have gone. The editorial record is supposed to answer
"where did this go out?" months afterwards; an answer that moves is not a record.

### Nobody with one account is asked anything

A workspace with a single connected account gets it silently, with no field and
no decision. The picker only appears on the channel editor when there is more than
one — which, per [0002](docs/decisions/0002-what-is-free.md), is a paid-tier
situation and therefore rare.

### The per-post choice survives as an override

The review screen shows which account the post will go to, and lets it be changed
before approval. That keeps the useful half of the create-time selector — a
deliberate exception, made at the moment somebody takes editorial responsibility —
without making it a question on every post.

### The account goes into the editorial record

It records the media id today and never which account published. "Which of my
accounts did this go out on" is exactly the class of question that document
exists to answer.

## The gate has to refuse an unpublishable post

Independent of all the above, and the part that actually closes the loop.

`evaluateGate` has no idea whether a post can be published at all. Approving one
with no connected account is currently allowed, and the result is the silent
retry described above. So:

- **Block when no account is resolved**, or when the resolved account is not
  `connected`. `loadReadiness` has computed almost exactly this for the settings
  page all along; the gate never asked it.
- **The worker must persist its failures.** `publishPost` returning without a
  write is the bug that turns one unresolvable post into an infinite loop. A
  refusal it cannot recover from must be written as `failed` with a reason, the
  same way every other terminal outcome is.

That second point is the real defect. The account question is a design choice;
returning a failure without recording it is a mistake, and it would produce the
same loop for any future cause.

## Consequences

**Good.** Publishing works at all. The watermark and the account can no longer
disagree, because both belong to the channel. An unpublishable post is refused at
approval with a sentence naming the reason, instead of being accepted and then
retried forever in silence.

**Cost.** One nullable column. One gate block, and every consumer of the gate
gains a case. Channels created before this have no account and their posts will
be refused at approval until one is chosen — which is correct, and is a visible
prompt rather than a silent stall.

**Accepted limit.** A channel pointed at an account whose token has expired
blocks at approval rather than at connect time. The settings readiness panel is
where that is meant to be noticed, and it already shows it.

**Not done here.** `loadReadiness` still picks an account with an unordered
`LIMIT 1`, which is fine for its actual question ("can this workspace publish at
all?") and wrong if it is ever used to decide *which* account. Left with a comment
saying so rather than redesigned, because the readiness panel is not where that
decision belongs any more.
