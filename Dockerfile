# Multi-stage build for the Next.js standalone server output.
# node:22-slim (Debian) is used for every stage so Prisma's default
# "native" binary target — resolved at `prisma generate` time in the
# builder stage — matches the runtime OS exactly, avoiding the
# musl/glibc mismatch that a mixed alpine/debian build would hit.

FROM node:22-slim AS base
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- deps: install once, reused by the builder stage ----
FROM base AS deps
COPY package.json package-lock.json ./
# `npm ci` runs the postinstall hook (`prisma generate`), which needs the
# schema present — copied in ahead of the full source so this stage still
# caches independently of unrelated source changes.
COPY prisma ./prisma
# --include=dev overrides npm's default of skipping devDependencies when
# NODE_ENV=production is set — Coolify injects the app's NODE_ENV env var
# into the build too, and the build needs devDependencies (typescript,
# @tailwindcss/postcss) to run `next build`.
RUN npm ci --include=dev

# ---- builder: generate the Prisma client, apply migrations, build ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The Prisma client generates to src/generated/prisma/client (a top-level
# src path per schema.prisma's custom `output`, not inside node_modules) —
# it doesn't survive the deps stage's `COPY --from=deps .../node_modules`
# above, and it's gitignored so the git checkout doesn't have it either.
# Regenerate it here, now that the full source is present.
RUN npx prisma generate
# Same steps as `npm run build` (prisma migrate deploy && next build), but
# with --webpack: the @next/swc-linux-x64-gnu optional binary Turbopack
# needs isn't present in this image even though Linux glibc x64 is a
# supported Turbopack platform, so it falls back to WASM bindings, which
# don't support Turbopack at all. --webpack is Next's own documented
# escape hatch for exactly this ("Turbopack is not supported on this
# platform... To build on this platform, use Webpack instead"). Scoped to
# the Docker build only — package.json's own build script (used by local
# dev/Render) is untouched.
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
RUN npx prisma migrate deploy && npx next build --webpack

# ---- runner: minimal image, only the standalone server + static assets ----
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
