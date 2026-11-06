# Sitio y sistema de Atenmefa.
#
# La web pública se genera estática y el panel de /sistema se sirve en el
# momento, así que la imagen final lleva Node y no nginx: el servidor de
# Astro atiende las dos cosas.
FROM node:22-alpine AS construir
WORKDIR /app

RUN corepack enable

# Playwright solo se usa para las capturas y las pruebas en local.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# El dominio final entra como argumento de construcción: el canonical y los
# datos estructurados se escriben en el HTML y no se pueden cambiar después.
ARG SITIO=https://atenmefa.site
ENV SITIO=$SITIO
RUN pnpm build

# ---------------------------------------------------------------
FROM node:22-alpine AS servir
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

# Solo lo que hace falta para correr: ni código fuente ni dependencias de
# desarrollo. BASE_DATOS, AUTH_SECRETO y URL_BASE vienen del entorno.
COPY --from=construir /app/node_modules ./node_modules
COPY --from=construir /app/dist ./dist
COPY --from=construir /app/package.json ./package.json

EXPOSE 4321

# Sin curl en la imagen: el chequeo lo hace Node contra una ruta pública.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4321)+'/robots.txt').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "./dist/server/entry.mjs"]
