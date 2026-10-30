# Ayko Core, with the backoffice built in (see DECISIONS.md).
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/core/package.json apps/core/
COPY apps/backoffice/package.json apps/backoffice/
RUN npm ci --no-audit --no-fund
COPY packages packages
COPY apps apps
RUN npm run build

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/core/package.json apps/core/
COPY apps/backoffice/package.json apps/backoffice/
RUN npm ci --omit=dev --workspace @ayko/core --workspace @ayko/contracts --no-audit --no-fund

FROM node:24-bookworm-slim
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
