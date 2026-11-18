# syntax=docker/dockerfile:1
# ── Dockerfile Otimizado para Coolify (Next.js 15 Standalone + BuildKit Cache) ──
FROM node:20-alpine AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS deps
RUN apk add --no-cache libc6-compat

COPY package.json pnpm-lock.yaml* .npmrc* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --store-dir=/pnpm/store || \
    pnpm install --no-frozen-lockfile --ignore-scripts --store-dir=/pnpm/store

# ── Builder ──
FROM deps AS builder
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV DOCKER_STANDALONE=true

# Fallback para build estático do Next.js caso as envs não venham no Coolify build-time
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL:-https://placeholder.supabase.co}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY:-placeholder}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-https://app.phonecenter.tech}

RUN --mount=type=cache,id=nextjs,target=/app/.next/cache pnpm run build

# ── Runner ──
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copia arquivos estáticos públicos
COPY --from=builder /app/public ./public

# Copia a saída standalone e os arquivos estáticos do .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
