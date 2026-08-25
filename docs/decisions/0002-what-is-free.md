# 2. The verification gate is free, forever

Date: 2026-07-26
Status: accepted

## Context

This is sold software. Something has to be paid for, and the tempting answer is
the feature that took the most thought — the verification stage and the publish
gate that blocks a post when a load-bearing claim is unsupported.

That instinct is wrong on three counts.

**It is not defensible.** `packages/content/src/gate.ts` is a few hundred lines
of mechanical threshold logic: confidence floors, blocks versus warnings,
caption length, slide counts, whether a resolved claim was overridden by a
person. It is deliberately mechanical rather than model-judged, which is what
makes it trustworthy — and also what makes it a weekend's work to reimplement
once the schemas are public. Charging for it means charging for the easiest
part of the system while giving away the render engine, the tenant isolation
and the publishing client.

**It is the identity.** The second sentence of the README is "Not a slop
generator." A free tier that generates unsourced carousels *is* a slop
generator. That would mean shipping, for free, the exact product this one was
built in opposition to, and then asking people to pay to stop it being that.
Every free user becomes an argument against the paid one.

**The evidence points the same way.** Mixpost gates its core function — which
networks you may publish to — and has roughly a tenth the adoption of Postiz,
which gates nothing and launched a year later. Not conclusive on its own;
Postiz also repositioned toward a different audience, which its founder credits
for the inflection. But it is the only direct comparison available in this
category and it points one direction.

## Decision

Free, with no licence key, including for commercial use of your own channels:

- The research stage, the gate, and the review screen
- Overrides, with the reason and the reviewer's name recorded
- The exportable per-post record
- Every slide template, theme and niche pack
- Instagram OAuth, publishing, scheduling, token refresh, insights
- One organisation, two connected accounts, one user

Paid tiers gate **operating scale**, not capability: additional connected
accounts, team members and roles, multiple organisations, white-labelling, and
the contractual right to operate the software on behalf of third parties.

The line is drawn by *who wants the feature*, not by how hard it was to build.
A solo creator — the person most likely to recommend this to someone else —
never hits the ceiling. The moment this becomes somebody's agency rather than
somebody's tool, they do. That is the correct place for the wall.

## Consequences

The free tier is genuinely useful and genuinely complete, which means adoption
has to come from the product being good rather than from the free version being
crippled. That is a slower path and a better one.

It also means the moat is not the code. It is the licence terms, the
convenience of not maintaining a fork, and whatever reputation this earns. Any
engineering effort spent on making the gate harder to extract is wasted; that
effort belongs in the onboarding, which is where buyers are actually lost.

Enforcement of the paid limits fails **open**: an invalid or expired key drops
the paid features back to free-tier limits and shows a persistent banner. It
never halts the process. Someone's publishing queue must not die at six in the
evening because a licence check went wrong.
