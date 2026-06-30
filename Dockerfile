FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 cannamatch

COPY --from=deps    --chown=cannamatch:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=cannamatch:nodejs /app/dist         ./dist
COPY --from=builder --chown=cannamatch:nodejs /app/api          ./api
# src/engine + src/lib + src/data are imported at runtime by api/server.js (scorer,
# basketPlanner, legacyBridge, basketRoutes, categoryConfig, …) — all required in the image.
COPY --from=builder --chown=cannamatch:nodejs /app/src/engine   ./src/engine
COPY --from=builder --chown=cannamatch:nodejs /app/src/lib      ./src/lib
COPY --from=builder --chown=cannamatch:nodejs /app/src/data     ./src/data
COPY --chown=cannamatch:nodejs package.json ./

USER cannamatch
EXPOSE 5000
ENV PORT=5000

CMD ["node", "api/server.js"]
