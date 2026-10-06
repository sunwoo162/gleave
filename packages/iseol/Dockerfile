FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    ISEOL_WEB_HOST=0.0.0.0 \
    ISEOL_WEB_PORT=3000 \
    ISEOL_WEB_TOKEN=

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev --ignore-scripts && npm cache clean --force

COPY tsconfig.json .env.example iseol-runtime.example.json ./
COPY iseol-runtime.example.json ./iseol-runtime.json
COPY src ./src
COPY scripts ./scripts
COPY web ./web
COPY user-ui/package.json user-ui/package-lock.json ./user-ui/
RUN npm --prefix user-ui ci --include=dev --ignore-scripts
COPY user-ui/src ./user-ui/src
COPY user-ui/index.html user-ui/vite.config.ts user-ui/tsconfig.json ./user-ui/
COPY user-ui/.figma/make/site.json ./user-ui/.figma/make/site.json
RUN npm run build && npm run user-ui:build

RUN useradd --create-home --uid 10001 npc \
  && mkdir -p /app/data /app/data/browser-profile \
  && chown -R npc:npc /app

VOLUME ["/app/data"]
EXPOSE 3000
USER npc

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node scripts/docker-healthcheck.mjs

CMD ["npm", "run", "iseol:runtime", "--", "start"]
