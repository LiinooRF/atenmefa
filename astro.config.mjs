// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';

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
  /**
   * Las páginas públicas se generan estáticas, como hasta ahora. Solo las
   * de /sistema/ se sirven en el momento, porque necesitan sesión y base
   * de datos: llevan `export const prerender = false`.
   */
  adapter: node({ mode: 'standalone' }),
  build: {
    inlineStylesheets: 'auto',
  },

  /**
   * El chequeo de origen de Astro se apaga acá y se hace a mano en el
   * middleware. No es un relajo de seguridad, es lo contrario: detrás de
   * un proxy que termina el TLS, el servidor ve la petición como http y
   * rechaza el Origin https que manda el navegador, así que TODO formulario
   * daba 403. Comparar contra URL_BASE, que es el origen público real y la
   * aplicación ya conoce, es más preciso que adivinarlo del socket.
   */
  security: { checkOrigin: false },
  compressHTML: true,
});
