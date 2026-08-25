---
date: 2026-07-25
phase: 0–1
milestone: First carousel rendered end to end
tags: [foundation, multi-tenancy, security, rendering, typography]
screenshots: [out/01-hook.jpg, out/02-pair.jpg, out/07-sources.jpg]
post_candidate: true
---

# Day 1 — Foundation, and the first slides that actually look good

Goal for the session: get from an empty folder to a JPEG that could genuinely be
posted. Reached it. 43 tests, 8 rendered slides, ~315ms per slide.

## What got built

- Monorepo, Docker Compose, dual database driver (embedded PGlite for dev, real
  Postgres for production)
- 15-table schema with tenant isolation enforced by Postgres, not by convention
- AES-256-GCM secret storage
- The topic-agnostic niche system — 8 slide formats, none of which name a subject
- The render engine: React → headless Chromium → Sharp → JPEG
- Security threat model written down before the code it describes

## Three decisions worth explaining

### 1. Tenant isolation lives in the database, not the queries

The obvious way to keep customers apart is `WHERE org_id = ?` on every query.
The problem is that it **fails open**. Forget it once, in one handler, and a
customer sees another customer's data — and the bug is an *absence*, so it sails
through code review.

Row-level security fails closed. Forget the clause and you get zero rows.

Two details make it real rather than decorative, and both are easy to miss:

- `FORCE ROW LEVEL SECURITY` — without `FORCE`, the table **owner** bypasses
  every policy, and the owner is exactly who the app connects as.
- Queries run as a dedicated non-superuser role, because **superusers bypass RLS
  even with FORCE**. PGlite connects as a superuser by default, so without this
  the isolation tests would have passed trivially in dev and the protection
  would only have existed in production. That is a genuinely nasty trap.

The test suite doesn't check that our queries are careful. It writes queries
that are deliberately *wrong* — no `WHERE` clause, targeting another tenant's
row by primary key — and asserts the database refuses. All 7 pass, including the
subtle one: a tenant can't re-parent its own row into someone else's account.

### 2. The formats don't know what the app is about

The channel I'm building is German myth-vs-fact. The obvious move is to build
that. But then the product is a myth-vs-fact tool, and every other topic is a
rewrite.

So no format names a subject. They describe the *shape* of an argument —
a claim and its evidence, an ordered list, a striking number unpacked — and any
topic pours into any shape. There's a test that greps the format definitions for
words like "myth", "recipe", "portfolio" and fails if any appear.

That test exists because I know I'll be tempted later, at 1am, to just hardcode
one thing.

### 3. Auto-fit has to wait for the fonts

Text is measured in the browser and binary-searched down until it fits its box.
First version measured at parse time — and got it wrong, because the inlined
webfonts hadn't loaded yet. It sized headlines against Georgia's metrics and
then rendered them in Newsreader.

The failure mode is what makes this interesting: it looks completely fine on
short headlines. It only breaks on the long ones — which are precisely the ones
that needed fitting. So it would have shipped, and failed intermittently, on the
posts that mattered most.

Fix is one line: wait for `document.fonts.ready`.

## What broke

**JSX compiled with the wrong runtime.** `React is not defined`, from a codebase
with no `import React` because it doesn't need one. Cause: `tsx` resolves a
single tsconfig from its working directory, and files in *other* workspace
packages fall outside that config's `include`, so they silently fell back to the
classic JSX runtime.

Chased it through three wrong fixes (a pragma — which only works once the
runtime is already automatic; setting `jsx` in the package config; setting it
directly rather than via `extends`) before the actual fix: one root tsconfig,
and run scripts from the root. Cost about twenty minutes and taught me something
about how four different toolchains disagree on config resolution.

**Two formats declared impossible slide counts.** `claim-evidence` said its
minimum was 5 slides while having 6 roles. Caught by a test that walks every
format at every allowed length. Fixed the data, then added the schema rule that
makes the whole class of bug impossible.

## Numbers

| | |
|---|---|
| Tests | 43 passing |
| Render time | ~315ms per slide, 2.5s for a carousel of 8 |
| Output | 1080×1350 JPEG, 60–200KB per slide |
| Fonts | 6 families, 305KB, inlined as data URIs |
| Cost per post (projected) | $0.30–0.60 |

## Next

Content pipeline: ideate → fact-check → write. The fact-check stage is the part
I actually care about — it's what separates this from a slop generator, and it's
also where the most interesting security problem lives, because the model will
be reading pages off the open web that may be written specifically to manipulate
it.

---

## Post candidates from this session

**"Your multi-tenant app probably leaks data and the bug is invisible"**
Hook: the `WHERE` clause you forgot doesn't throw an error. It returns someone
else's data. Carousel: fails-open vs fails-closed, the FORCE gotcha, the
superuser gotcha, the test that writes wrong queries on purpose.

**"I built a text-fitting algorithm. It was wrong in a way that only showed up on the hard cases."**
Hook: it measured the text before the font loaded. Perfect on short headlines,
broken on long ones — so it would have shipped. Good hook because the failure is
counterintuitive and the fix is one line.

**"The test that stops me hardcoding my own use case"**
Hook: I'm building this for one channel but selling it for any. So there's a
test that fails if my code ever mentions my own topic.
