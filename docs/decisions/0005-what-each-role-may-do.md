# 5. What each role may do

Date: 2026-07-26
Status: accepted

## Context

`member.role` has existed since authentication did. The enum in
`schema/enums.ts` names four values — `owner`, `admin`, `editor`, `viewer` — the
column is populated by Better Auth's organization plugin, and `session.ts`
resolves it into `ActiveSession.role` on every single request.

```
$ rg -n "session\.role" --glob '!node_modules' .
(no matches)
```

Nothing ever read it. Every match for `.role` in `apps/web` turned out to be a
*slide* role.

So the permission model was decoration. A member stored as `viewer` could
approve a post, override a claim verdict, schedule a publish and change which
Instagram account it went to — every one of those irreversible and outward
facing, under somebody else's name. The word "viewer" appeared in a database
column and meant nothing at all.

This is the same shape as the other findings from that audit: every piece built
correctly, and the connection between them never made.

## Decision

Three capabilities, not one permission per action.

| Capability | Covers |
| --- | --- |
| `publish` | Approving, rejecting, overriding a claim verdict, changing the destination account |
| `edit` | Slide copy, post text, pictures, structure, channels, generation |
| `read` | Everything else |

| Role | |
| --- | --- |
| `owner`, `admin` | all three |
| `editor` | `read`, `edit` |
| `viewer` | `read` |

### Why capabilities rather than a permission per action

The interesting line is not "which button" but "what kind of harm". Approving a
post and overriding a claim verdict are the same *kind* of decision — both put
something in front of a real audience under a real name, and both are recorded
against the person who made them. Fixing a typo and adding a slide are also the
same kind: recoverable, and visible to whoever approves afterwards.

A permission per action would have to be extended every time an action is added,
and the extension would be forgotten exactly once. Three capabilities means a new
action has to answer one question — is this a publish decision or an edit? — and
there is no third answer to overlook.

### Why `editor` cannot approve

It is the useful shape for the people this product is actually sold to: a
freelancer writing for a client, or an agency's junior. They should be able to
produce and fix; the person whose account it is decides what goes out.

It is also the only split that keeps the editorial record meaningful. The record
names who approved a post, and the AI Act Art. 50(4) exemption turns on that
person having taken responsibility. A role called "editor" that could also sign
off would make the distinction the record depends on unenforceable.

### Unknown roles fail closed

Better Auth allows a role string to be anything, and this install's own enum
could gain a value before the capability map does. An unrecognised role gets
`read` only.

Same reasoning as the gate refusing a post whose channel will not validate: not
knowing the rules is not the same as there being none. The alternative — treating
an unknown role as an admin — is the failure mode where adding a value to an enum
silently grants publishing rights.

### Enforced in the action, reflected in the interface

Every check lives in the server action. The controls are also hidden, and that
is a courtesy rather than the control: a server action is a public endpoint, and
the only thing separating it from a hand-crafted POST is the check written
inside it. That lesson is already in this codebase twice — the approve button
that was "protected" by a `disabled` attribute, and the edit actions that
re-derive `editable` rather than trusting the page.

`editableContext` in the review actions carries the check for every edit, so a
new edit action cannot forget it. Approve, reject, claim override and the
account change ask for `publish` explicitly.

## Consequences

**Good.** The four role names mean something. A workspace can add a collaborator
without handing them the ability to publish. `session.role`, resolved on every
request since the beginning, is finally read.

**Cost.** Six actions gained a check and three screens gained a condition.
Anyone who was relying on a `viewer` being able to edit — nobody, since this
install has one member — will find they cannot.

**Implemented after this decision.** The People screen now creates expiring,
email-bound invitation links. A recipient signs in or creates an account through
that link, confirms the join, and the invited workspace becomes active. The
confirmation matters: link previewers and security scanners fetch shared URLs,
and opening an invitation must not spend it. The rail also exposes a workspace
switcher when someone belongs to more than one workspace.

**Deliberately not scoped per channel.** A role applies to the whole workspace,
not to individual channels. Per-channel permissions are a real thing to want for
an agency running ten clients, and they are a different feature — one that needs
a join table and a decision about what a channel-scoped `viewer` sees on the
board. Left until somebody asks.
