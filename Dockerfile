# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl \
 && addgroup -S -g 1001 app && adduser -S -u 1001 -G app app \
 && mkdir -p /data/files && chown app:app /data/files
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    FILE_STORAGE_DIR=/data/files \
    TEMPLATES_DEFAULT_DIR=/app/templates-default \
    NEXT_TELEMETRY_DISABLED=1
# Standalone server first, then the full node_modules over it so that the
# Prisma CLI (migrate deploy) and tsx (one-off seed) are available at runtime.
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/templates-default ./templates-default
COPY --from=build --chown=app:app /app/src/lib/auth/password.ts ./src/lib/auth/password.ts
USER app
EXPOSE 3000
VOLUME ["/data/files"]
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && exec node server.js"]
