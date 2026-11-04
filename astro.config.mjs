// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

/**
 * El dominio y la base se pasan por entorno para que el mismo código sirva
 * para la vista previa y para producción:
 *
 *   producción (Contabo)   pnpm build
 *   vista previa (Pages)   SITIO=https://liinoorf.github.io BASE=/<repo>/ PREVIA=1 pnpm build
 *
 * Con PREVIA=1 la copia se publica con noindex, para que no compita en Google
 * con el sitio real.
 */
const sitio = process.env.SITIO ?? 'https://atenmefa.site';
const base = process.env.BASE ?? '/';

export default defineConfig({
  site: sitio,
  base,
  integrations: [sitemap()],
  build: {
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
});
