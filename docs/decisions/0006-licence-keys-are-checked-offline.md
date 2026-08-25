# 6. Licence keys are checked offline, and gate nothing yet

Date: 2026-07-26
Status: accepted

## Context

Three places already described a licensing system:

- `.env.example` — "Ed25519-signed key, verified offline. Blank runs in
  evaluation mode."
- `docker-compose.yml` — passes `LICENSE_KEY` through to both containers.
- `schema/enums.ts` and `schema/auth.ts` — a `licenseTier` enum of
  `evaluation | solo | studio | agency`, and a column commented "Cached from the
  licence key at boot so feature gates are a column read rather than a signature
  verification on every request."

None of it was read by anything. `rg -i "ed25519|licenseKey|license_key"` found
the two config files and the comment, and no verification code at all. Setting
`LICENSE_KEY` did nothing; the column sat on its default on every install; there
were no feature gates for it to be a column read instead of.

Meanwhile [0002](docs/decisions/0002-what-is-free.md) sells paid tiers gating
connected accounts, team members, roles, multiple organisations and
white-labelling, and promises that "an invalid or expired key drops the paid
features back to free-tier limits and shows a persistent banner."

## Decision

Build the verification and the banner. **Gate nothing.**

### Offline, with the public key in the build

An Ed25519 signature over a small JSON payload, in the form
`CLAIMFOLD-1.<payload>.<signature>`, both parts base64url. The vendor's public
key ships in the build via `LICENSE_PUBLIC_KEY`; the private half signs keys and
never enters this repository.

Offline is the whole point, not an optimisation. A self-hosted product that calls
a licence server stops working when the vendor's server does — and the absence of
that dependency is a substantial part of what a self-hosted buyer is paying for.
It also means the vendor cannot accidentally acquire a log of who is running what,
which is a promise worth being able to make.

Base64url because a key is pasted into an `.env` file, a shell and a YAML block,
and any of those can mangle `+`, `/` and `=`. The version prefix so a future
format change is a clear refusal rather than a confusing signature failure.

### The signature is checked before the payload is read for anything

Including its own expiry date. Reading an expiry out of an unsigned payload and
concluding a key is "merely expired" would let anybody mint one that claims a
tier — the difference between a signed statement and a string.

### Five states, and "unverifiable" is not "invalid"

| State | Meaning | Banner |
| --- | --- | --- |
| `evaluation` | no key set | none |
| `valid` | signature matches, not expired | none |
| `expired` | signature matched, date passed | amber, names the licensee |
| `invalid` | signature does not match, or unreadable | red |
| `unverifiable` | a key is set, this build has no public key | neutral |

The last one is the distinction worth having. "We cannot check this" and "this is
fake" are different things to tell somebody, and the difference is whose mistake
it is: a build shipped without `LICENSE_PUBLIC_KEY` is the vendor's packaging
error, and the banner says so. Collapsing it into `invalid` would accuse a paying
customer of forgery because of a missing environment variable.

Silence in the two normal cases is deliberate. A banner that appears on every
screen for a state that is fine is a banner people stop seeing, and the whole
value of the expired case depends on it being noticed.

### Nothing is gated

No feature reads the tier. Everything works identically in every state.

Two reasons. The first is that [0002](docs/decisions/0002-what-is-free.md) is a
pricing *argument*, not a specification — it does not say how many connected
accounts the free tier gets, and "white-labelling" is not defined anywhere in the
code. Enforcing it would mean inventing numbers and calling them a decision
somebody else made.

The second is the failure mode. This product is self-hosted: the person affected
by a wrong limit is the operator, on their own machine, with their own data, and
the most likely way to meet a half-built gate is a licence that fails to verify
for a reason that is our fault — see `unverifiable` above. Locking somebody out
of their own workspace because a build was packaged wrong is a worse outcome than
every unlicensed install that this does not stop.

So the honest position is the one the banner states out loud: *nothing is
restricted*. Turning limits on is a separate, deliberate change that needs a
number per tier.

### The column is finally written

`organization.licenseTier` is synced from the settings page rather than at boot,
because a Next application has no boot hook, and writing it on every request
would be a database write per page view for a value that only changes when the
process restarts. It is written only when it differs.

## Consequences

**Good.** Setting `LICENSE_KEY` does something. An expired licence is visible
instead of silent. Three config files stop describing a feature that does not
exist, and the column stops sitting on a default it could never leave.

**Cost.** One module, one banner, two vendor scripts. The public key has to be in
the environment of every build shipped, and a build without it says so rather
than failing quietly.

**Accepted limit.** There is no revocation. A leaked key is valid until it
expires, which is why the payload carries an `id` — a revocation list is possible
later without changing the format, and would need somewhere to fetch it from,
which is exactly the network dependency this design avoids. For a product where
the alternative is trusting the honour system, a signed expiry is the right
amount of mechanism.

**Not done.** Tier enforcement. When it happens it needs a limit per tier, and it
should fail toward letting the operator work — a gate that cannot tell whether it
is allowed should allow.
