# Sitio de Atenmefa. Estatico: se construye y se sirve con nginx.
FROM node:22-alpine AS construir
WORKDIR /app

RUN corepack enable

# Playwright solo se usa para las capturas en local: no hace falta su navegador.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM nginx:1.27-alpine AS servir
COPY --from=construir /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
