# Lumitra Mail dashboard image (linux/arm64 for the shared Hetzner box).
# Build context is the repository root, since this is a pnpm workspace:
#   docker build -f apps/dashboard/Dockerfile .

FROM infisical/cli:0.43.69 AS infisical

FROM node:22-alpine AS builder
WORKDIR /repo
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
# Only what resolving the dashboard's dependency graph needs, so a change to an
# unrelated package does not invalidate this layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY packages/mail-contract/package.json packages/mail-contract/package.json
COPY packages/mail-sdk/package.json packages/mail-sdk/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/blocks/package.json packages/blocks/package.json
COPY packages/editor/package.json packages/editor/package.json
RUN pnpm install --frozen-lockfile --filter @email-editor/dashboard...
COPY tsconfig.json ./
COPY packages/mail-contract packages/mail-contract
COPY packages/mail-sdk packages/mail-sdk
COPY packages/core packages/core
COPY packages/ui packages/ui
COPY packages/blocks packages/blocks
COPY packages/editor packages/editor
COPY apps/dashboard apps/dashboard
# The workspace packages first (the editor, the contract, the SDK), then the
# Next.js standalone server. The build never needs a runtime secret. One
# package at a time keeps the peak memory within a small builder.
RUN pnpm --workspace-concurrency=1 --filter "@email-editor/dashboard^..." build \
 && pnpm --filter @email-editor/dashboard build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Infisical CLI from the official image, pinned. Never curl-pipe-bash.
COPY --from=infisical /bin/infisical /usr/local/bin/infisical
# The standalone output carries the server and exactly the node_modules it traces.
COPY --from=builder --chown=node:node /repo/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --chown=node:node apps/dashboard/entrypoint.sh ./entrypoint.sh
RUN chmod 0755 ./entrypoint.sh

ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

USER node
EXPOSE 3000
# Liveness plus configuration: /api/health is 503 until the secrets are present.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["./entrypoint.sh"]
