# syntax=docker/dockerfile:1
# Frontend-ul este un SPA static, servit de Caddy. Caddy este și punctul de intrare HTTPS:
# obține automat certificatul și redirecționează /api către containerul API.

FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
# `--ignore-scripts`: `nuxt prepare` (postinstall) rulează oricum ca parte din build.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter "@alconst/web..."
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @alconst/shared build && pnpm --filter @alconst/web build

FROM caddy:2-alpine AS web
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/.output/public /srv
EXPOSE 80 443 443/udp
