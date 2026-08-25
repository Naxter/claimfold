---
title: The button that went nowhere
date: 2026-07-26
phase: 4
milestone: generate-and-audit-record
tags: ['dead-links', 'linting', 'oauth', 'pglite', 'audit-trail']
screenshots:
  - docs/media/generate-and-record/generate.png
  - docs/media/generate-and-record/niches.png
  - docs/media/generate-and-record/review.png
post_candidate: true
---

# The button that went nowhere

## What changed

The board had a green **Generate post** button in the top right. It had been
there for days. It linked to `/generate`, and `/generate` did not exist.

Two more links in the navigation bar — Niches, Insights — pointed at routes
that had never been written either. Three dead links in a product whose entire
pitch is that it refuses to publish things it cannot stand behind.

So: `/generate` is real now. Pick a niche, optionally give it a topic, press
the button, wait about two minutes, land on the finished post. `/niches` shows
the topic configuration. Insights is gone from the navigation until Phase 5
exists, because a nav entry is a promise and a dead one is the first thing
anybody clicks.

The other new thing is the **editorial record** — `/posts/{id}/record`, plus
JSON and CSV exports. Every claim, every verdict, every source, every override
with the name of the person who made it, the approver, and the timestamp. It is
the answer to "where did you get that?", and it is the specific evidence the
EU AI Act's Article 50(4) human-review exemption asks a publisher to be able to
produce from 2 August 2026.

It prints. That is deliberate: no PDF library, no embedded fonts, no
dependency to maintain. The browser already renders it correctly on every
platform, and Ctrl+P produces the file.

## What broke

**The lint step had never run.** `package.json` said `"lint": "eslint ."`.
ESLint was not installed. There was no config. The `// eslint-disable-next-line`
comments scattered through the codebase — carefully written, referencing real
rule names — were decorative. Nothing had ever read them.

Installing it properly surfaced 44 problems. Most were mechanical. Three were
not:

1. **`String(payload['access_token'])`.** The OAuth code read every field out
   of Meta's responses that way. When the value is an object — which is exactly
   what happens when Meta returns an error shape instead of the documented one
   — `String()` produces the literal text `[object Object]`. That string would
   then be AES-encrypted, written to the database as an access token, and used.
   Every subsequent publish would fail with an opaque Graph API error pointing
   nowhere near the real cause. A *missing* token was already guarded against;
   a token that was present but not a string sailed straight through, because
   an object is truthy.

2. **`String(formData.get(key))` in server actions.** `FormData.get` returns
   `string | File | null`. A file part becomes `[object File]`. A server action
   is a public HTTP endpoint — anyone can post multipart data to it with any
   field as a file. Nothing leaked, because the values were compared against
   database ids that would never match. But "does not match anything" is luck,
   not a check.

3. **An async `onSubmit` handler on the sign-in form.** React does not await
   the returned promise, so anything escaping the try/catch became an unhandled
   rejection and the person just watched a spinner.

None of these were found by reading the code. They were found by a tool that
had been declared, referenced in comments, and never actually run.

**And PGlite does not survive being killed.** Mid-session I hard-killed the dev
server while it was writing. PGlite is Postgres compiled to WebAssembly, and
the data directory came back unrecoverable — fifty lines of WASM stack trace
ending in `_pg_initdb`, which tells a developer precisely nothing. Removing the
stale `postmaster.pid` did not help. The directory was gone.

There is now `npm run db:reset`, and the migrator recognises that specific
failure and prints the fix instead of the stack trace.

**It does not always fail immediately, which is worse.** The second time this
happened the directory looked fine. It opened. Migrations applied. The
dashboard served pages for twenty minutes. Then a session lookup returned
`RuntimeError: Aborted()` from deep inside the WebAssembly runtime, and every
request after it failed the same way.

The delay is the trap. A crash on startup is self-explanatory; a crash twenty
minutes later gets attributed to whatever was being worked on at the time —
in this case a stylesheet — and the real cause is a process that was killed
half an hour earlier. Two things told the truth quickly and are worth
reaching for in that order:

1. Read to the *bottom* of the error. The Drizzle "Failed query" wrapper on
   top is noise; `[cause]: RuntimeError: Aborted()` is the actual finding.
2. Open the directory from a standalone script. If a fresh process aborts
   too, it is the database and not the server, and `db:reset` is the answer
   rather than a restart.

`postmaster.pid` is not the signal. It is present after a clean shutdown as
well, so deleting it diagnoses nothing — which is consistent with it not
helping the first time either.

## What I decided, and why

**The gate saves its refusals.** When verification blocks an idea before the
writing stage, there is no carousel to review — but there are verdicts, sources
and reasoning explaining exactly why it was refused. Throwing that away would
be strange: it is the most interesting artefact the system produces. It is
saved as a rejected post, so it lands in the right column with its evidence
attached.

**Generation is exclusive per organization, enforced by the database.** A
partial unique index on `(org_id, kind) WHERE status = 'running'`. The
alternative — check whether one is running, then insert — loses the race
between two simultaneous requests, and each generation costs about $0.43. A
double-clicked button should not be two API bills. Same reasoning as row-level
security: where correctness matters, let Postgres refuse.

**Two minutes of silence is a hang.** The form says what it is doing, what it
costs, and names the four stages, because a button that greys out for two
minutes reads as broken and gets clicked again.

## Still open

The name. `claimfold.ai` is a live commercial product, there is a
`github.com/claimfold` org, and the npm package is taken. Renaming a project
with no users costs an afternoon. Renaming one after a launch costs the launch.

The licence file says BUSL 1.1 and the research says Fair Core would be a
better fit — it is the only licence in the comparison set that says anything
about licence keys, which is the mechanism this product would actually use.

And a real question raised by looking at twenty developer-tool marketing sites
this week: almost none of them ship 3D. Linear ships 155 KB of JavaScript and
no graphics at all. That is worth sitting with before building anything
elaborate.
