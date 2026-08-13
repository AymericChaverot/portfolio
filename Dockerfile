# ─────────────────────────────────────────────────────────────────────────
# Étape 1 : dépendances de build
# ─────────────────────────────────────────────────────────────────────────
# Debian slim plutôt qu'Alpine : sharp fournit des binaires précompilés pour
# la glibc, ce qui évite toute compilation native au build.
FROM node:24-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

# ─────────────────────────────────────────────────────────────────────────
# Étape 2 : build du site
# ─────────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# L'URL publique est figée dans les balises canoniques et Open Graph, elle
# doit donc être connue au build.
ARG PUBLIC_SITE_URL=http://localhost:4321
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL

RUN npm run build

# ─────────────────────────────────────────────────────────────────────────
# Étape 3 : dépendances de production uniquement
# ─────────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ─────────────────────────────────────────────────────────────────────────
# Étape 4 : image finale
# ─────────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=80
ENV DATABASE_PATH=/data/portfolio.db
ENV UPLOADS_DIR=/data/uploads
# Les images d'origine du dépôt, importées en base au premier démarrage.
ENV SEED_ASSETS_DIR=/app/dist/client
# Derrière nginx : l'IP réelle et le protocole viennent des en-têtes X-Forwarded-*.
ENV TRUST_PROXY=1

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Volume de données : base SQLite + fichiers uploadés. L'utilisateur `node`
# doit pouvoir y écrire.
RUN mkdir -p /data/uploads && chown -R node:node /data /app

USER node

EXPOSE 80

# Vérifie que le serveur répond réellement, pas seulement que le process vit.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4321)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "./dist/server/entry.mjs"]
