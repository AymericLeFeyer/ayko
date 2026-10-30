# Two images: `core` (default, with the backoffice built in) and `display` (--target display).
FROM node:24-bookworm-slim AS toolchain
# better-sqlite3 may compile from source; none of this reaches the final images.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

FROM toolchain AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/core/package.json apps/core/
COPY apps/backoffice/package.json apps/backoffice/
COPY apps/display/package.json apps/display/
RUN npm ci --no-audit --no-fund
COPY packages packages
COPY apps apps
RUN npm run build

FROM toolchain AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/core/package.json apps/core/
COPY apps/backoffice/package.json apps/backoffice/
COPY apps/display/package.json apps/display/
RUN npm ci --omit=dev --workspace @ayko/core --workspace @ayko/contracts --no-audit --no-fund

# Static files and a dependency-free Node server: light enough for the N4020 mini PC.
FROM node:24-bookworm-slim AS display
ENV NODE_ENV=production
WORKDIR /app/apps/display
COPY --from=build /app/apps/display/dist dist
COPY apps/display/server server
USER node
EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:3200/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server/server.mjs"]

FROM node:24-bookworm-slim AS core
ENV NODE_ENV=production AYKO_DATA_DIR=/data AYKO_BACKOFFICE_DIR=/app/apps/backoffice/dist
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/package.json package.json
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY packages/contracts/package.json packages/contracts/
COPY --from=build /app/apps/core/dist apps/core/dist
COPY apps/core/package.json apps/core/
COPY apps/core/drizzle apps/core/drizzle
COPY apps/core/mock apps/core/mock
COPY --from=build /app/apps/backoffice/dist apps/backoffice/dist
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3100/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/core/dist/main.js"]
