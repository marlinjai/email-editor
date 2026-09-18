# Lumitra Mail service image (linux/arm64 for the shared Hetzner box).
# Build context is the repository root, since this is a pnpm workspace:
#   docker build -f apps/service/Dockerfile .

FROM infisical/cli:0.43.69 AS infisical

FROM node:22-alpine AS builder
WORKDIR /repo
RUN corepack enable
# Only what resolving the service's dependency graph needs, so an editor
# package change does not invalidate this layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/service/package.json apps/service/package.json
RUN pnpm install --frozen-lockfile --filter @email-editor/service...
COPY apps/service apps/service
RUN pnpm --filter @email-editor/service build \
 && pnpm --filter @email-editor/service deploy --prod /out

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Infisical CLI from the official image, pinned. Never curl-pipe-bash.
COPY --from=infisical /bin/infisical /usr/local/bin/infisical
COPY --from=builder --chown=node:node /out/node_modules ./node_modules
COPY --from=builder --chown=node:node /out/package.json ./package.json
COPY --from=builder --chown=node:node /repo/apps/service/dist ./dist
COPY --from=builder --chown=node:node /repo/apps/service/migrations ./migrations
COPY --chown=node:node apps/service/entrypoint.sh ./entrypoint.sh
RUN chmod 0755 ./entrypoint.sh

ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

USER node
EXPOSE 3000
# busybox wget is in the base image; the check hits 127.0.0.1, never localhost
# (which resolves to ::1 first while the server binds 0.0.0.0).
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1
ENTRYPOINT ["./entrypoint.sh"]
