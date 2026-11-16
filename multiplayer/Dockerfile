# The room server. Build from the repo root:
#   docker build -t homecraft-room -f multiplayer/Dockerfile .
#   docker run -p 8787:8787 -e SITE='https://island.example.com' homecraft-room
# Behind Caddy/Nginx for TLS: the site connects as wss:// to the proxy.
FROM node:22-alpine
WORKDIR /app
COPY multiplayer/server/package.json ./
RUN npm install --omit=dev --no-fund --no-audit
COPY multiplayer/server/*.js ./
USER node
EXPOSE 8787
ENV PORT=8787
CMD ["node", "server.js"]
