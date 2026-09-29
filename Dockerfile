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
# `npm run build` runs `prisma migrate deploy && next build` — migrate
# deploy needs a live DB connection at build time, same as this app's
# existing build behavior.
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
RUN npm run build

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
