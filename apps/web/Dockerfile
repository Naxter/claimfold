# syntax=docker/dockerfile:1

# Dashboard image.
#
# No Chromium here — the web app only renders React previews in the browser.
# Rasterising happens in the worker, which keeps this image about 1GB smaller.

FROM node:25-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ── Dependencies ─────────────────────────────────────────────────────────────
# Manifests only, so this layer is cached until a dependency actually changes.
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/content/package.json packages/content/
COPY packages/crypto/package.json packages/crypto/
COPY packages/db/package.json packages/db/
COPY packages/ig/package.json packages/ig/
COPY packages/niches/package.json packages/niches/
COPY packages/render/package.json packages/render/
COPY packages/storage/package.json packages/storage/
COPY packages/templates/package.json packages/templates/
COPY packages/trends/package.json packages/trends/

# Skip Chromium: the web image never rasterises.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

# ── Build ────────────────────────────────────────────────────────────────────
FROM base AS build
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY --from=deps /app/node_modules ./node_modules

# npm does not hoist everything. A few of the web app's dependencies conflict
# with versions elsewhere in the workspace and end up nested in
# apps/web/node_modules instead of at the root, and .dockerignore keeps every
# node_modules out of the build context, so copying only the root left them
# missing and `next build` could not resolve better-auth. Local builds passed
# because the working tree already had them.
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

COPY . .

# Fonts are required: without them previews fall back to system faces and stop
# matching what gets published.
#
# They ARE committed — all six OFL faces, about 350KB, are in
# packages/templates/assets/fonts. This is a refresh, and the script keeps the
# committed copy when a download fails, so the build no longer depends on
# Google Fonts being reachable.
RUN npx tsx scripts/fetch-fonts.ts && npm run build --workspace apps/web

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production

# Non-root. This process holds database credentials and serves the internet.
RUN groupadd -r claimfold && useradd -r -g claimfold -m claimfold

# `output: 'standalone'` traces the modules a request actually reaches and
# emits them under .next/standalone. Copying the whole build stage instead
# shipped the source tree, typescript, eslint, vitest, drizzle-kit and the
# Playwright test runner into production.
COPY --from=build --chown=claimfold:claimfold /app/apps/web/.next/standalone ./
COPY --from=build --chown=claimfold:claimfold /app/apps/web/.next/static ./apps/web/.next/static

# Next bundles its own sharp and postcss, and file tracing carries BOTH into
# the standalone output — verified, not assumed: they arrive as sharp 0.34.5
# (GHSA-f88m-g3jw-g9cj, four libvips CVEs) and postcss 8.4.31
# (GHSA-qx2v-qp2m-jg93 and two more). npm `overrides` do not reach them; the
# root pins in package.json take, the nested copies under next/ do not, which
# is a documented npm limitation with a dependency declared optional.
#
# Neither is reachable at runtime — sharp only through `next/image`, which this
# app does not use (apps/web/lib/__tests__/no-next-image.test.ts fails the
# build if that changes), and postcss only at build time — but an unreachable
# vulnerable native library still ships, still shows up in a scan of the image,
# and still has to be explained. Removing them is cheaper than explaining them.
#
# Our own sharp, a direct dependency of @claimfold/render pinned to ^0.35.3,
# sits at node_modules/sharp and is untouched by this.
RUN rm -rf node_modules/next/node_modules/sharp \
           node_modules/next/node_modules/@img \
           node_modules/next/node_modules/postcss

# Rendered slides are written by the worker and read here. Declared so the
# volume mount does not land on a root-owned directory.
RUN mkdir -p /app/storage && chown -R claimfold:claimfold /app/storage

USER claimfold
EXPOSE 3000

# Next binds to 3000 inside the container; compose maps it outward.
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
