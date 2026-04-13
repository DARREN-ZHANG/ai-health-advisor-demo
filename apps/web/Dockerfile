# ---- Base ----
FROM node:23-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/charts/package.json packages/charts/
COPY packages/config/package.json packages/config/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# ---- Build ----
FROM deps AS build
ARG NEXT_PUBLIC_AGENT_API_BASE_URL=http://localhost:3001
ARG NEXT_PUBLIC_ENABLE_GOD_MODE=true
ENV NEXT_PUBLIC_AGENT_API_BASE_URL=$NEXT_PUBLIC_AGENT_API_BASE_URL
ENV NEXT_PUBLIC_ENABLE_GOD_MODE=$NEXT_PUBLIC_ENABLE_GOD_MODE

COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/
RUN pnpm --filter @health-advisor/web build

# ---- Production ----
FROM node:23-slim AS prod
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/ui/dist packages/ui/dist
COPY --from=build /app/packages/ui/package.json packages/ui/
COPY --from=build /app/packages/charts/dist packages/charts/dist
COPY --from=build /app/packages/charts/package.json packages/charts/
COPY --from=build /app/apps/web/.next apps/web/.next
COPY --from=build /app/apps/web/public apps/web/public
COPY --from=build /app/apps/web/package.json apps/web/
COPY --from=build /app/apps/web/next.config.ts apps/web/next.config.ts

RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
