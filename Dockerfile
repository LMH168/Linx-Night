FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:client-vue && npm prune --omit=dev

RUN groupadd --system --gid 10001 linxnight \
  && useradd --system --uid 10001 --gid 10001 --home-dir /var/lib/linx-night --create-home --shell /usr/sbin/nologin linxnight \
  && mkdir -p /run/linx-night /var/lib/linx-night/LinxNight/profiles /var/lib/linx-night/LinxNight/audio /var/lib/linx-night/LinxNight/evidence \
  && chown -R linxnight:linxnight /run/linx-night /var/lib/linx-night

ENV NODE_ENV=production \
    HOME=/var/lib/linx-night \
    APP_HOST=0.0.0.0 \
    CLIENT_HOST=0.0.0.0

EXPOSE 5000 5010 9091

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD node -e "Promise.all([5000,5010,9091].map(p=>fetch('http://127.0.0.1:'+p+(p===5010?'/':'/health')))).then(r=>{if(r.some(x=>!x.ok))process.exit(1)}).catch(()=>process.exit(1))"

USER linxnight
ENTRYPOINT ["node", "scripts/start-local.mjs", "/run/linx-night/runtime.env"]
