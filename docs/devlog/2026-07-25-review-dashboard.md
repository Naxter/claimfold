---
date: 2026-07-25
phase: 3
milestone: The gate is now a thing you can look at
tags: [nextjs, auth, multi-tenancy, review-ui, rsc]
post_candidate: true
---

# Day 1, part 3 — Making the refusal visible

The pipeline could already reject a post. Now a human can see *why*, look at
the evidence, and be prevented from approving anyway.

## The screen

Board on the left, review screen per post. What matters is the ordering of
attention: the gate verdict sits above the slides, not below them. A reviewer
should learn "this is blocked and here is the claim" before they start admiring
the typography, because a good-looking carousel is exactly what makes a weak
claim slip through.

Seeded a deliberately weak claim to prove it:

> **Blocked — 1 issue**
> ✕ Core claim is below this niche's confidence floor (0.55 < 0.75):
> *"Die durchschnittliche Lebenserwartung lag bei exakt 30 Jahren."*

And the Approve button is `disabled`, not merely styled as a warning. To publish
that post you must first resolve the specific claim, and the resolution is
recorded against your user id. Overriding a fact-check should leave fingerprints.

## Previews are the real components, scaled

The review screen renders the *same* React components the publisher
screenshots, at full 1080×1350, then scales them with a CSS transform. Not a
re-layout at a smaller size — a transform. Type sizes, line breaks and spacing
stay proportionally identical, so what you approve is what publishes.

The one honest gap: the browser-side auto-fit pass runs during rendering, not in
the preview. Copy near a budget limit can look slightly *larger* here than in
the final JPEG. Larger, never smaller — so the preview can't hide an overflow.

## Session → organization is the whole ballgame

Row-level security enforces access to whatever org id it is handed. It protects
against a forgotten `WHERE` clause; it cannot protect against being *told the
wrong tenant*.

So `getActiveSession()` re-verifies membership against the database on every
request rather than trusting `activeOrganizationId` from the session cookie.
That field is user-influenceable state, and a stale or tampered value must not
become access. Server actions likewise never accept an org id from the client —
they re-resolve the session, so a forged post id belonging to another tenant
simply matches no row.

A server action is a public endpoint. The only thing between it and a
hand-crafted POST is the authorisation you write yourself.

## What broke

**`react-dom/server` leaked into a Server Component.** The templates package's
index re-exported `document.tsx` — the standalone-HTML generator used by the
render pipeline — which imports `react-dom/server`. Next refuses to load that
inside a Server Component, so the entire review page 500'd.

The tempting fix is a bundler workaround. The correct fix was that the package
had one entry point where it needed two: components for anyone rendering React,
and a separate `@claimfold/templates/document` for the Node-only HTML
generation. The dashboard never needed the second one; it was only being dragged
in because everything lived behind one export.

**Windows shell expansion in an npm script.** `next dev --port ${PORT:-3100}`
works in bash and silently fails under `cmd.exe`, which is what npm uses on
Windows. Empty log, exit code 1, no error. Worth remembering for a product
people will self-host on whatever OS they own.

## Numbers

| | |
|---|---|
| Tests | 43 passing |
| Packages typechecking | 6 |
| Time to first paint of the board | ~1s dev |

## Next

Instagram publishing. The first phase where something leaves the building, and
where the 24-hour container expiry and the three-different-rate-limits problem
finally have to be dealt with rather than described.

---

## Post candidates

**"Your server actions are public endpoints"**
Hook: it looks like a function call in your component. It's an HTTP POST anyone
can craft. Everything you didn't check is a hole.

**"RLS can't save you from being told the wrong tenant"**
Hook: row-level security is excellent at enforcing access to the org you name.
Which is the problem, if you name it from a cookie.

**"The approve button is disabled, and that's the whole product"**
Hook: an AI writing tool whose main feature is refusing to let you publish.
