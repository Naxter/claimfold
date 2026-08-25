# syntax=docker/dockerfile:1

# Worker image: publish queue, rendering, token refresh, insights.
#
# This one carries Chromium, because rasterising slides happens here. That
# makes it the large image — which is the reason web and worker are separate
# rather than one container running both.

FROM node:25-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

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

# Chromium is installed explicitly in the runtime stage, with its system deps.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

# ── Production dependencies ──────────────────────────────────────────────────
# A second, deterministic install rather than pruning the first: `npm ci
# --omit=dev` resolves from the lockfile, where `npm prune` mutates a tree in
# place and is fiddly to reason about across workspaces.
#
# The web image gets this for free from `output: 'standalone'`, which traces
# what a request actually reaches. The worker has no equivalent — it runs
# TypeScript through tsx — so the dev/prod split has to be explicit or the
# runtime ships eslint, vitest, drizzle-kit and the Playwright test runner.
#
# `tsx` is a real dependency of apps/worker, not a devDependency, precisely
# because it is the runtime here. `playwright` and `sharp` are dependencies of
# @claimfold/render for the same reason, so both survive this.
FROM base AS prod-deps
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --omit=dev

FROM base AS runtime
ENV NODE_ENV=production

# An init process is not optional here. Chromium spawns a process tree per
# render and `packages/render/src/browser.ts` deliberately drops dead pages, so
# without a reaper a crashed render leaves defunct children that accumulate
# until the container restarts. Node does not reap; tini does.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps /app/node_modules ./node_modules

# This MUST come before `playwright install`. The install writes to the
# invoking user's cache (/root/.cache/ms-playwright) unless the variable is
# already set — and /root is mode 700, so the runtime user could not read it
# even if it looked there. Setting it afterwards pointed the runtime at an
# empty directory and every render failed with "Executable doesn't exist".
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# `--with-deps` pulls the shared libraries Chromium needs on Debian slim.
# Playwright ships matched builds for linux/amd64 and linux/arm64, so this
# works unchanged on a cheap ARM VPS.
RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# Source last: every layer above is cached until a dependency changes. With
# `COPY . .` above this, editing one line re-downloaded Chromium.
COPY . .

# Fonts must exist before the first render or slides silently fall back to
# system faces — and the published image would then differ from the preview
# the reviewer approved. All six faces are committed; this is a refresh that
# no-ops offline, not a download the build depends on.
RUN npx tsx scripts/fetch-fonts.ts

# Non-root. This process holds decrypted Instagram tokens in memory and drives
# a browser — the two things you least want running as root.
RUN groupadd -r claimfold && useradd -r -g claimfold -m claimfold \
    && mkdir -p /app/storage \
    && chown -R claimfold:claimfold /app/storage /home/claimfold /ms-playwright

USER claimfold

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npx", "tsx", "apps/worker/src/index.ts"]
