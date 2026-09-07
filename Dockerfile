# ── stage 1: 构建前端 ─────────────────────────────────────────────────────────
FROM node:22-alpine AS web-builder
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ── stage 2: 安装服务端生产依赖 ───────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# ── stage 3: 运行时（服务端 + 前端静态文件）────────────────────────────────────
FROM node:22-alpine
RUN apk add --no-cache tini && mkdir -p /data && chown node:node /data

WORKDIR /app
COPY --from=deps  /app/node_modules ./node_modules
COPY server/package.json ./
COPY server/src ./src
COPY --from=web-builder /web/dist ./web

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3210 \
    HOST=0.0.0.0 \
    WEB_ROOT=/app/web \
    NODE_OPTIONS=--max-old-space-size=128

USER node
VOLUME ["/data"]
EXPOSE 3210

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
