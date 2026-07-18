# Multi-stage build for the Peon Pipelines app + worker.
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
# node-gyp toolchain for optional ssh2/cpu-features native bindings on Alpine.
RUN apk add --no-cache python3 make g++ linux-headers
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# postinstall runs `prisma generate` — schema must be present during install.
COPY prisma ./prisma
COPY prisma.config.ts ./
# Honor packageManager from package.json (avoids Corepack pulling pnpm 11+
# with supply-chain age gates that break frozen-lockfile installs).
RUN corepack prepare --activate
# --prod=false: hosts often inject NODE_ENV=production and would skip
# prisma (needed for generate) and other build tooling.
# Dummy URL so prisma.config.ts can load during generate (no DB needed).
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/peon?schema=public"
RUN pnpm install --frozen-lockfile --prod=false

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/src/lib/prisma/generated ./src/lib/prisma/generated
COPY --from=build /app/worker ./worker
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/docs ./docs

EXPOSE 3000
# Default runs the web app; override command to `pnpm worker` for the worker service.
CMD ["pnpm", "start"]
