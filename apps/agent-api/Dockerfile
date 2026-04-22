# ---- Base ----
FROM node:23-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/sandbox/package.json packages/sandbox/
COPY packages/agent-core/package.json packages/agent-core/
COPY packages/config/package.json packages/config/
COPY apps/agent-api/package.json apps/agent-api/
RUN pnpm install --frozen-lockfile

# ---- Build ----
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/agent-api/ apps/agent-api/
COPY data/ data/
COPY scripts/create-runtime-package-json.mjs scripts/
RUN pnpm --filter @health-advisor/agent-api... build
RUN node scripts/create-runtime-package-json.mjs packages/shared .runtime-manifests/packages/shared
RUN node scripts/create-runtime-package-json.mjs packages/sandbox .runtime-manifests/packages/sandbox
RUN node scripts/create-runtime-package-json.mjs packages/agent-core .runtime-manifests/packages/agent-core

# ---- Production ----
FROM node:23-slim AS prod
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --from=build /app/.runtime-manifests/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/.runtime-manifests/packages/sandbox/package.json packages/sandbox/package.json
COPY --from=build /app/packages/sandbox/dist packages/sandbox/dist
COPY --from=build /app/.runtime-manifests/packages/agent-core/package.json packages/agent-core/package.json
COPY --from=build /app/packages/agent-core/dist packages/agent-core/dist
COPY --from=build /app/apps/agent-api/dist apps/agent-api/dist
COPY --from=build /app/apps/agent-api/package.json apps/agent-api/
COPY --from=build /app/data /app/data

RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/agent-api
ENV NODE_ENV=production
ENV DATA_DIR=/app/data/sandbox
EXPOSE 3002
CMD ["node", "dist/index.js"]
