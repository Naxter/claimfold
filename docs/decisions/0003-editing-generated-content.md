# 3. Editing a generated post

Date: 2026-07-26
Status: accepted — P1, P2 and P3 implemented

## What shipped, and where it differs from the plan below

All three pieces landed together. Four differences worth recording, because each
one is a decision rather than a shortcut:

- **The editor stacks Text and Look instead of using tabs.** The panel is narrow
  and the Look half is one select, so tabs would have been a mechanism standing
  in for a divider — and tab buttons do nothing without JavaScript, while a
  second form works.
- **Uploading a picture happens as part of saving the slide**, in the same form,
  rather than through its own endpoint. An upload that stored an image and then
  discarded the text somebody had just typed would be a worse bug than a slower
  one. The live preview uses a local `blob:` URL so the choice is visible before
  the round trip.
- **Reordering is up/down, not drag-and-drop.** It works on a phone, works
  without JavaScript, and cannot half-finish.
- **`slides.editedAt` is stamped by comparing content, not by being told.**
  Swapping a photograph changes the pixels but no word any claim was read
  against, and re-saving an unchanged form changes nothing at all — so neither
  raises the verification warning. See `updateSlide`.

Two gate findings came along for the ride: `hook_not_first`, because
rearranging by hand can bury the only slide most people see, and the
long-dormant `slideIndex` on every finding, which now makes each one a link to
the editor for the slide it is about.

## Context

A post comes out of the pipeline and lands on the review screen. From there a
person can approve it, stop it, override a claim verdict, or export the record.
They cannot change a single word, or a single colour.

That is not a missing nice-to-have. It breaks the product's own promise. The
review screen exists so a human takes editorial responsibility for what goes
out — and reading is not the same as being responsible for it. If the only two
answers are "publish this exactly" and "throw it away", a typo costs $0.43 and a
minute of generation.

### Nothing is stopping us

Worth saying plainly, because it is easy to mistake care for difficulty: there
is no technical or platform reason any of this is hard. The slides are React
components in this repository, rendered from a `jsonb` column in this database,
onto a canvas whose geometry is a constant in this codebase. We own every layer.

The only genuinely external constraints are four, and none of them touches
editing:

- 1080×1350 on every slide, because Instagram crops later slides to slide one's
  aspect ratio.
- JPEG, because the API rejects PNG.
- Ten slides maximum.
- Assets served from a publicly reachable HTTPS URL, because Meta's crawler
  fetches them server-to-server.

Everything else in this document is our own rule, and our own rules are
negotiable in a way Meta's are not. The reason editing does not exist is not a
constraint at all: the pipeline was built end to end first, and the review
screen was built to *approve* its output. `updateSlide` and `updatePost` were
written for the editor that never followed.

### "Visuals" is still not one thing

The word covers six features. They differ in *risk*, not really in effort —
which is a distinction the first draft of this document got wrong, pricing
review effort as build effort.

| | What a person means | Exists today? | Effort | Real risk |
| --- | --- | --- | --- | --- |
| **T** | Change the words on a slide | Data layer only, no UI | Hours | Claims now describe text nobody checked (§8) |
| **A** | Change the theme (four built-in looks) | `posts.themeId` + `updatePost()`, no UI | An hour | None |
| **B** | Put my handle on every slide | Plumbed end to end, **nothing ever sets it** | An hour | None |
| **C** | Give *this one slide* a different layout | Not possible — `slides` has no template column | Hours | Silent empty slide after a family switch (§4) |
| **D** | My own colours and fonts | Themes are a hardcoded array | Hours (accent) / a design question (full) | Unreadable slides; contrast check must move to save time |
| **E** | Put a photo on a slide | Not possible at any level | A day | First file the product accepts from a person |
| **F** | Reorder, add, delete slides | Not possible | A day | **Corrupts the evidence trail** — claims are bound to slides by index |

### What is already built

Most of the machinery for T, A and B exists and has no callers.

- `updateSlide()` — [posts.ts:225](packages/db/src/repositories/posts.ts:225).
  Content patch plus alt text, clears the render cache. **Zero callers.**
- `updatePost()` — [posts.ts:247](packages/db/src/repositories/posts.ts:247).
  Caption, hashtags, hook, **themeId, templateId**. **Zero callers.**
- `computeRenderHash()` — [render.ts:74](packages/render/src/render.ts:74).
  Already hashes template, theme, role, content, page, watermark and language,
  so any change to any of them re-renders exactly the affected slides
  ([publish-job.ts:166](apps/worker/src/publish-job.ts:166)).
- `SlidePreview` — [slide-preview.tsx](apps/web/components/slide-preview.tsx).
  The same React components the publisher screenshots, scaled. A live preview
  costs one browser re-render and no server round trip.
- `watermark` is threaded through `renderSlide`, the render hash, `SlideView`
  and `Slide` — and **no code path anywhere sets a value**. A finished feature
  with no switch attached.
- Gate findings already carry a `slideIndex`
  ([gate.ts:44](packages/content/src/gate.ts:44)). The review page ignores it,
  because there is nothing to point at.

### The dead end that makes this urgent

The gate blocks approval when any slide has no alt text
([gate.ts:208](packages/content/src/gate.ts:208)), and `slideDraftSchema`
accepts an empty string ([schemas.ts:112](packages/content/src/schemas.ts:112)).

So a post that comes back with one blank alt text can never be approved and
never be fixed. The review screen even renders "no alt text" in red next to the
slide — an error message pointing at a control that does not exist. Same shape
for `caption_too_long` and `too_many_hashtags`.

This is the fault described in
[the devlog](docs/devlog/2026-07-26-the-button-that-went-nowhere.md): every
component correct on its own, no handover between them.

---

## What has to stay true

Seven constraints the design is not free to ignore. Each one already has a
comment in the code defending it.

1. **The gate cannot become optional.** Editing must not be a route around a
   blocked claim. The gate keeps evaluating on the server, after the edit, from
   the database.
2. **A server action is a public endpoint**
   ([actions.ts:12](apps/web/app/posts/[id]/actions.ts:12)). Re-resolve the
   session, never accept an org id from the client, re-check on the server
   anything a disabled button prevented.
3. **What is reviewed is what is published.** The preview scales the real
   render. The only divergence is the browser-side auto-fit pass, which only
   ever makes published text *smaller*.
4. **The render browser makes zero network requests**
   ([document.tsx:15](packages/templates/src/document.tsx:15)). Fonts are
   inlined as data URIs. This is what closes the SSRF surface (T4 in
   [0001](docs/decisions/0001-security-posture.md)). Any image support has to
   be inlined the same way — not fetched.
5. **Contrast is verified, not assumed.** Every built-in theme pair clears WCAG
   AA ([themes.ts:10](packages/templates/src/themes.ts:10)), and
   [contrast.test.ts](apps/web/lib/__tests__/contrast.test.ts) reads the
   dashboard's values out of the stylesheet so a bad colour fails the build.
   The moment colours become user data, a build-time test cannot cover them and
   the check has to move to save time.
6. **Every slide is exactly 1080×1350.** Instagram crops later slides to slide
   one's aspect ratio, so this is not a default, it is a rule
   ([themes.ts:134](packages/templates/src/themes.ts:134)).
7. **Editing after verification is a fact about the post.** See §8 — the only
   genuinely hard part of this.

---

## Decision

**Build one editor, ship it in three pieces.** Not six layers — the split below
is by risk, so each piece is a thing that can be reviewed as a whole rather than
a sequence of half-features.

| Piece | Contains | Migration | Why it stops here |
| --- | --- | --- | --- |
| **P1 — The editor** | Slide copy, alt text, caption, hashtags, hook, theme, watermark, per-slide layout (**T A B C**) | 4 columns | Everything that edits data the pipeline already writes |
| **P2 — Images** | Upload, normalise, one image layout, accent colour (**E**, **D**-accent) | 3 columns | First file accepted from a person; first user-chosen colour |
| **P3 — Structure** | Reorder, add, delete slides (**F**) | none | Only piece that can corrupt the evidence trail |

P1 is the whole of "let me fix this post" and is not much more work than the
text-only version, because theme and watermark are switches on finished
features and the per-slide layout is one nullable column.

Full custom themes (**D** beyond one accent colour) is left out on purpose. It
is not effort — it is a design question: the four themes pair a display face, a
body face, a texture and a heading case that were chosen *together*, and a UI
that lets someone mix them freely mostly produces worse slides. That deserves an
argument, not a form.

The sections below keep the per-feature detail; the layer letters map onto the
three pieces above.

---

## 1. The editor surface

**On the review page, in place.** Not a separate `/edit` route.

The reason is the gate. Findings are rendered at the top of the review page and
carry `slideIndex`. Same page means "Slide 3 has no alt text" becomes a link
that scrolls to slide 3 and opens its editor. A separate route breaks that
thread and makes the reviewer hold the finding in their head while navigating.

```
┌─ Look ─────────────────────────────────────────────┐   ← L2, post-level
│  Theme  [Paper] [Ink] [Bold] [Slate]   ← live      │
│  Watermark  [ @yourhandle          ]               │
└────────────────────────────────────────────────────┘

┌──────────────────┐  ┌──────────────────────────────┐
│                  │  │ ( Text )  ( Look )           │   ← Look tab is L3+
│   SlidePreview   │  │ Kicker      [              ] │
│   (live, 260px)  │  │ Headline    [              ] │
│                  │  │             38 / 46          │
│                  │  │ Body        [              ] │
│                  │  │             180 / 220        │
│                  │  │ Alt text *  [              ] │
└──────────────────┘  │             [Save] [Cancel]  │
  3. evidence         └──────────────────────────────┘
```

The counters are the role's `headlineBudget` and `bodyBudget` from the format
([formats.ts](packages/niches/src/formats.ts)). Soft — the renderer shrinks type
to fit — so they inform, they do not block.

Each form is a real `<form action={…}>` with an `ActionButton`, so it works
without JavaScript. The live preview is the enhancement: a client component
holds the draft in `useState` and re-renders `SlidePreview` on every keystroke.
That works only because `@claimfold/templates` keeps `react-dom/server` behind
a separate entry point ([render.ts:5](packages/render/src/render.ts:5)) — the
component entry is plain React and safe in the browser.

---

## 2. L1 — text and alt text

### Which fields to show

Each template reads a different subset of `SlideContent`, and a field no
template reads is a box where typing does nothing. Today that mapping exists
only implicitly, inside the JSX of
[templates.tsx](packages/templates/src/templates.tsx):

| Slide | Fields the renderer actually reads |
| --- | --- |
| role `hook` | kicker, headline, body |
| role `sources` | kicker, headline, items[], footnote |
| role `cta` | headline, body |
| `editorial` | kicker, headline, body, footnote |
| `split` | kicker, headline, items[0] (top panel), items[1] (tinted panel), footnote |
| `list` | figure (the big position badge), headline, body, items[] |
| `timeline` | figure (the date), headline, body |
| `figure` | figure, figureLabel, headline, body — *falls back to `editorial` when `figure` is empty* |

**Export that table as data** from `@claimfold/templates` (a new `fields.ts`),
with a test that every key a template reads appears in the map. The editor and
the renderer then cannot drift, and L3 needs the same map anyway.

Two behaviours to surface in the UI rather than document:

- On a `split` slide the panels are `items[0]` and `items[1]`; `body` is only a
  fallback for the top panel. The editor writes `items` and drops `body` on
  save, so the slide has one source of truth.
- On a `figure` slide, clearing the figure switches the layout to editorial.
  The live preview shows this; no warning text needed.

### The data path

```
client draft ──▶ saveSlideAction ──▶ zod validate ──▶ normalise ──▶ updateSlide
                      │                                                  │
                 requireSession()                              renderHash = null
                 status check                                  assetId   = null
                 optimistic lock                                         │
                                                                revalidatePath
                                                            (gate re-evaluates
                                                             on the next render)
```

**Validation.** A `slideContentEditSchema` next to `slideDraftSchema` in
[schemas.ts](packages/content/src/schemas.ts), so the pipeline and the editor
agree on one shape. Unknown keys are **rejected, not stripped** —
`SlideContent` has an index signature, so a typo'd key would otherwise save
silently, stay invisible in the preview, and still change the render hash. The
pipeline only ever writes the seven known keys, so a rejection means a bug, not
a user mistake.

Hard caps, generous enough never to be hit by real copy: headline 300, body
2000, kicker 120, footnote 300, figure 40, figureLabel 80, items 12 × 300, alt
text 1000 (Instagram's own limit).

**Normalisation matters more than it looks.** An empty string and an absent key
are the same slide and two different render hashes — `computeRenderHash` sorts
keys but does not drop empties, so `{headline:'x', body:''}` and `{headline:'x'}`
would each keep their own cached image forever. So: trim every string, delete
keys that end up empty, drop blank array entries.

**Editability is checked on the server.** The page already computes
`editable = !['published','publishing','scheduled'].includes(post.status)`
([page.tsx:129](apps/web/app/posts/[id]/page.tsx:129)); the action re-derives
it. Editing a scheduled post means unscheduling first — a deliberate speed bump,
because the worker may be seconds from claiming it.

**Optimistic locking.** Two reviewers, or one reviewer with two tabs, currently
produce a silent last-write-wins. `slides.updatedAt` already exists: send it as
a hidden field, add it to the `WHERE`, treat zero updated rows as "this slide
changed while you were editing — reload."

**Two fixes to `updateSlide` while we are in there.**

- It matches on slide id alone. Row-level security stops a cross-tenant write —
  the boundary that matters — but within an org a slide id belonging to a
  different post is accepted and the wrong page is revalidated. Add `postId` to
  the `WHERE`.
- It nulls `renderHash` and `assetId` unconditionally
  ([posts.ts:239](packages/db/src/repositories/posts.ts:239)), including for an
  alt-text-only patch. Alt text is correctly *not* part of the render hash, so
  fixing alt text currently forces a pointless re-render. Only invalidate when
  `content` is in the patch.

---

## 3. L2 — theme and watermark

Both already work. Neither has a switch.

**Theme.** Four radio cards, each showing this post's own slide 1 rendered in
that theme — the preview is free, so show the real thing rather than a swatch.
Saving calls `updatePost({ themeId })`. The theme is in the render hash, so
every slide re-renders at publish. That is ten renders, bounded and expected.

One thing to get right: `updatePost` does not clear `renderHash`, and it does
not need to — the worker compares the *computed* hash against the stored one and
re-renders on a mismatch. Clearing the column as well would be harmless but
redundant, and the reason belongs in a comment or someone will "fix" it.

**Watermark.** Store it where it belongs conceptually: the handle is a property
of the channel, so `niches.watermark` (text, default `''`). The worker reads it
in `loadContext` — which already reads `language` from the niche for exactly
this kind of reason — and passes it into the render input, where the hash
already accounts for it. The preview already accepts the prop.

That is one column, two lines in the worker, one field in the niche editor, and
a capability that has been sitting finished and unreachable.

---

## 4. L3 — per-slide layout

`slides` gains `template_id text` (nullable). Effective template is
`slide.templateId ?? post.templateId`. `computeRenderHash` already takes the
template as an input, so cache invalidation is automatic and `RENDER_VERSION`
does not move.

Three traps:

1. **Hook, sources and CTA ignore the template entirely.** `SlideView`
   dispatches on role first, deliberately, so a carousel reads as a set
   ([templates.tsx:8](packages/templates/src/templates.tsx:8)). Offering a
   layout picker on those slides is offering a control that does nothing. Hide
   it, and say why in one line of UI text.
2. **Switching family changes which keys are read.** A `split` slide moved to
   `figure` has its text in `items[0..1]`, which `FigureBody` never reads — so
   the preview goes near-empty. The rule: **never delete keys on a switch.**
   Unused keys stay, stay hashed, and come back if the person switches back.
   The field editor shows the new template's fields, pre-filled where the key
   is shared. The live preview makes the consequence visible before saving,
   which is better than a warning dialog.
3. **`plan_mismatch` and `role_mismatch`** in the gate compare slides against
   the format's plan. Layout is not role, so neither fires here — but that is
   worth a test, because it is exactly the kind of thing that quietly starts
   firing later.

---

## 5. L4 — custom colours and fonts

Split in two, because the cheap half is 90% of the perceived value.

**L4a — accent override.** One colour, per post or per niche:
`accentColor text` on `niches`, overriding `theme.colors.accent` at
`getTheme` time. The accent is the rule, the kicker, the badge, the tinted
panel — it is what makes a feed look like one account's.

Validated at save, not at build: the pair (accent, background) must clear WCAG
AA large text, and (onAccent, accent) must clear it too, or the tinted panel in
`SplitBody` turns into unreadable text on a coloured block. Reuse the ratio
maths from [contrast.test.ts](apps/web/lib/__tests__/contrast.test.ts) — lift it
into a small shared module so the test and the validator use one implementation.
Refuse the save with the measured ratio in the message: "3.1:1, needs 3.0:1" is
a message someone can act on.

**L4b — full custom themes.** Themes become data, the way niches are data — an
org-scoped table, or jsonb on the niche, with `getTheme` resolving built-ins
first and custom ones after. Every foreground/background pair gets the same
save-time check.

Fonts are the hard limit here. They are inlined from disk at render time
([fonts.ts](packages/templates/src/fonts.ts)), so "choose a font" means
"choose from the six OFL families we ship". Anything else needs a font upload
path plus a licence question the operator has to answer, and the fallback
behaviour is deliberately platform-independent so a missing family stays
visible rather than silently resolving to Segoe UI on one machine and DejaVu on
another. Offer the six; say so plainly.

---

## 6. L5 — images on slides

About a day. The first draft of this document called it a project, which was
wrong — most of what images need is already installed:

- **sharp is already here.** `@claimfold/render` owns it directly at `^0.35.3`,
  and `apps/web` already depends on that package. The Dockerfile deletes only
  *Next's* bundled copy ([Dockerfile:57](apps/web/Dockerfile:57)), and
  [no-next-image.test.ts](apps/web/lib/__tests__/no-next-image.test.ts) exists to
  keep that safe. Nothing about image processing disturbs either.
- **The storage layer needs no changes.** `saveSlideImage` already shards by org
  and content hash; `resolvePath` already refuses anything that is not a `.jpg`
  inside the root.
- **The CSP already allows it.** `img-src 'self' data: blob:`
  ([middleware.ts:56](apps/web/middleware.ts:56)) covers both the preview URL and
  the inlined render.
- **The reset already styles it.** `img{max-width:100%;display:block}`
  ([document.tsx:38](packages/templates/src/document.tsx:38)) — anticipating an
  image nothing has ever emitted.
- **The pattern for keeping playwright out of the web bundle already exists.**
  `@claimfold/templates/document` is a separate entry point for exactly this
  reason ([render.ts:5](packages/render/src/render.ts:5)). A
  `@claimfold/render/image` entry exporting one `normaliseUpload()` follows it,
  and the dashboard never pulls in a browser driver.

**Why it cannot be a URL.** `renderSlideDocument` makes zero network requests by
design, and that is what closes T4. An image arrives the way fonts do: read from
local storage, inlined as a `data:` URI. Roughly 200–400KB per slide, the same
order as the fonts already inlined, free for a local browser. A `file://`
reference or a fetch from inside the render browser reopens the exact hole.

**One divergence to name.** The render inlines the bytes; the dashboard preview
points at `/assets/…`. Same bytes, two paths — and this is the one place the
codebase insists on no divergence between preview and render. It is benign, and
it should be a comment where the preview builds its `src`, not something someone
rediscovers.

**What has to be built:**

1. **An upload route.** Multipart POST, session-scoped, size cap enforced before
   anything is decoded.
2. **Re-encoding, always.** An uploaded file is never stored as received: decode
   with sharp, strip every metadata block (EXIF carries GPS), cap the long edge
   at the canvas size, re-encode as JPEG. That kills polyglot files, decoder
   exploits, and the accidental publication of someone's home address in one
   pass — and it is what makes the storage layer's `.jpg`-only rule a feature
   rather than an obstacle.
3. **`assets.kind`** — `'render' | 'upload'`. Same table, same content-hash
   paths, same anonymous serving route. Uploads become listable as a small
   per-org library, so the second post can reuse the first post's photo.
4. **`SlideContent.imageAssetId`** — a database id, never a path
   ([storage index.ts:16](packages/storage/src/index.ts:16)): a request
   identifies an asset by id, and nothing user-supplied is ever joined onto the
   storage root. The render hash covers it for free, because asset ids are minted
   per content hash — a different image is a different id is a different hash.
5. **One image layout, maybe two.** Full-bleed photo with the headline over it,
   and a half-and-half. Both need a **scrim** — a semi-opaque wash in the theme
   background colour between photo and text — because contrast over an arbitrary
   photo cannot be verified the way a colour pair can. A mandatory scrim is the
   only version of this that keeps constraint 5 honest.
6. **Alt text stops being a formality.** The gate block already exists, so the
   one control images would need is the one P1 already added.

**The genuinely new thing** is not the work — it is that this is the first file
the product accepts from a person. Everything upstream is either generated here
or fetched by the verifier under its own rules. That deserves the paragraph
above and a threat-model line in
[0001](docs/decisions/0001-security-posture.md), not a delay.

**Also decide before building:** whether an uploaded image appears in the audit
record. It should — "where did that photo come from" is the same question as
"where did that claim come from", and the record is this product's answer to that
class of question. And `posts.aiDisclosure` currently describes the text; if
AI-generated *images* ever land, that flag needs re-reading rather than reusing.

Instagram needs no changes at all: the photo is baked into the rendered JPEG.

---

## 7. L6 — structure

Deferred with the questions written down, because they are the actual work:

- What happens to a post whose slide count leaves its format's
  `minSlides`–`maxSlides` range? The gate has `slide_count` and `plan_mismatch`;
  do they block a hand-built carousel or defer to the person?
- How does `(post_id, index)` renumber without tripping its unique index
  mid-transaction? (Negative offsets, or `DEFERRABLE`.)
- Should a role picked by hand still be checked against the format plan, or
  override it?
- Deleting a slide orphans any claim whose `slideIndex` pointed at it, and
  reordering silently re-points the rest at the wrong slides. That is a
  correctness bug in the evidence trail, not a UI detail — and it is the reason
  this is last.

---

## 8. Verification integrity

The part that needs a decision rather than a mechanism, and it applies to every
layer above.

Claims are attached to slides by index
([core.ts:280](packages/db/src/schema/core.ts:280)). Edit the evidence slide and
the verdicts still say `supported`, with sources, against text that no longer
exists. Nothing would look wrong. For a product whose second README sentence is
"not a slop generator", verified-looking unverified text is the worst available
outcome.

**(a) Ignore it.** Rejected. The record would assert that checked claims back
words nobody checked. Worse than having no record.

**(b) Record the edit and warn.** `slides.editedAt` and `slides.editedBy`. The
gate emits a **warning**, not a block — `slide_edited_after_check`, carrying
`slideIndex` — for slides edited after their claims were checked. The audit
record gains "edited by *name* at *time*" per slide. Approval still allowed.

**(c) Re-verify on edit.** Correct, and wrong for now: costs money, takes
minutes, needs a job, and would fire on a typo fix.

**Choose (b).** A warning rather than a block is not a shortcut — it is the same
logic already applied to claim overrides
([gate.ts:100](packages/content/src/gate.ts:100)): a named human taking
responsibility, recorded, is a legitimate outcome. It is also the evidence the
AI Act Art. 50(4) exemption asks for, which is what
[audit-record.ts](apps/web/lib/audit-record.ts) exists to produce. An
*unrecorded* edit quietly weakens that document.

**Track text only.** A theme switch, a watermark or a layout change does not
touch a claim, so it must not raise a verification warning — a warning that
fires on a colour change teaches people to ignore warnings.

**Be honest about the limit.** This detects that a slide changed. It cannot
detect that an edit introduced a *new* factual claim: someone can type an
unverified statistic into a slide and the gate will only say the slide was
edited. The real answer is a later "re-check this claim" button — one claim, one
API call, wired to the existing verify stage. Until then the mitigation is that
the record names the editor and the warning is visible to whoever approves.

---

## 9. Schema changes, consolidated

```sql
-- L1
ALTER TABLE slides ADD COLUMN edited_at   timestamptz;
ALTER TABLE slides ADD COLUMN edited_by   text REFERENCES "user"(id) ON DELETE SET NULL;

-- L2
ALTER TABLE niches ADD COLUMN watermark   text NOT NULL DEFAULT '';

-- L3
ALTER TABLE slides ADD COLUMN template_id text;          -- null = inherit from post

-- L4a
ALTER TABLE niches ADD COLUMN accent_color text;         -- null = theme default

-- L5
ALTER TABLE assets ADD COLUMN kind        text NOT NULL DEFAULT 'render';
```

All nullable or defaulted, no backfill: null means "as generated", which is true
of every existing row. L4b and L6 need their own decisions and are not costed
here.

---

## 10. Interface strings

Four catalogues, and
[i18n.test.ts](apps/web/lib/i18n/__tests__/i18n.test.ts) checks them for parity,
so new keys land in `en`, `de`, `fr`, `es` in the same commit. New keys under
`review.edit.*`, plus `gate.slide_edited_after_check` for the warning.

---

## 11. Tests

Each exists because of a specific way this can go wrong.

- **Gate:** an edited slide warns, does not block; an unedited one does
  neither; a theme or layout change raises nothing.
- **Render hash:** `{headline:'x', body:''}` after normalisation hashes the same
  as `{headline:'x'}`. This is the permanent-cache-miss trap.
- **Repository:** a content patch clears `renderHash`; an alt-text-only patch
  does not. A stale `updatedAt` updates zero rows.
- **Action:** editing a `published` or `publishing` post is refused server-side
  with a valid session — the disabled attribute is not the control.
- **Fields map:** every content key a template reads appears in `fields.ts`.
- **Contrast (L4):** a failing accent is refused at save, with the ratio in the
  message.
- **Upload (L5):** an uploaded file with EXIF comes back out with none; a
  non-image is refused before decoding.
- **Round trip:** save a slide, re-evaluate the gate, confirm a
  `missing_alt_text` block clears. The alt-text dead end is why this work
  exists; something should hold it shut.

The publish-schedule test is the model: put the test *between* the two
components, because a gap like this is invisible when both sides pass their own
tests.

---

## Consequences

**Good.** The alt-text dead end closes. A typo costs a keystroke instead of a
generation. Two finished capabilities — theme switching and the watermark — stop
being unreachable. The review screen becomes a place where editorial
responsibility is actually exercised, which is the claim the audit record makes
on the operator's behalf.

**Cost.** Every edited slide re-renders at publish; bounded, and already handled
by the hash. A theme change re-renders all ten. The gate gains one warning code
and every consumer of it gains a case. Five columns across three tables.

**Accepted risk.** A determined editor can write an unverified claim into a
slide. The system records that they did and names them; it does not stop them.
The re-check button narrows this. Nothing narrows it to zero, and a design that
pretended otherwise would be the dishonest one.

**Split, not deferred.** P2 and P3 are separate commits because they carry
different risks, not because they are far off. P2 adds the first file the product
accepts from a person and the first colour a person chooses. P3 can re-point
every claim's `slideIndex` and corrupt the evidence trail rather than the layout
— which is the one failure here that a reviewer looking at the screen would not
notice.

**Left out on purpose.** Full custom themes. Not effort — a design question about
whether letting someone mix a display face, a body face, a texture and a heading
case that were chosen together produces anything good. Ship the accent override,
see whether anyone asks for more.
