# Casa Clo · Gestão — imagem do serviço (Decima Cloud)
# Sem build step: a SPA é estática (gestao/public/) e o servidor é Node puro.
# Contexto de build = RAIZ do repo (o executor da Decima Cloud manda o repo
# inteiro; lição portaria) — todos os COPY partem de gestao/.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# dependências (apenas pg, pelo lockfile)
COPY gestao/package.json gestao/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# código (server + db + SPA estática)
COPY gestao/server ./server
COPY gestao/db ./db
COPY gestao/public ./public

# não-root
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 8315
ENV PORT=8315
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q -O /dev/null http://127.0.0.1:8315/healthz || exit 1

CMD ["node", "server/index.mjs"]
