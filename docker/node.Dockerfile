# syntax=docker/dockerfile:1
# Imagine comună pentru procesele Node.js (API și worker). Țintele finale: `api`, `worker`, `migrate`.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# --- Build: instalează dependențele și compilează pachetele + aplicațiile Node -----------------
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@alconst/api..." --filter "@alconst/worker..."

COPY packages packages
COPY apps/api apps/api
COPY apps/worker apps/worker
RUN pnpm --filter "./packages/*" build \
 && pnpm --filter @alconst/api --filter @alconst/worker build

# Pachete de producție, fără dependențe de dezvoltare.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @alconst/api deploy --prod --legacy /out/api \
 && pnpm --filter @alconst/worker deploy --prod --legacy /out/worker

# --- Migrări: rulează `prisma migrate deploy` înainte de pornirea API-ului ----------------------
FROM build AS migrate
ENV NODE_ENV=production
# CLI-ul Prisma nu trebuie să contacteze serverele Prisma (verificarea de versiune) din producție.
ENV CHECKPOINT_DISABLE=1
WORKDIR /repo/packages/database
USER node
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# --- API ----------------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.API_PORT || 3001) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/main.js"]

# --- Worker -------------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/worker ./
USER node
CMD ["node", "dist/main.js"]
