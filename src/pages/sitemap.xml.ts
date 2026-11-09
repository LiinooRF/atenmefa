import type { APIRoute } from 'astro';

/**
 * `/sitemap.xml` lleva al índice de verdad.
 *
 * Astro genera `sitemap-index.xml` y `sitemap-0.xml`, y el robots.txt
 * apunta bien al índice. Pero la dirección que una persona escribe —y la
 * primera que prueba cualquiera que revisa un sitio— es `/sitemap.xml`, y
 * ahí había un 404. Parecía que el sitemap no existía.
 *
 * Va como redirección permanente y no como copia del XML: una copia se
 * desactualiza el día que el sitio pase de un archivo a dos. Google sigue
 * las redirecciones de los sitemaps, está en su documentación.
 */
export const prerender = false;

export const GET: APIRoute = ({ site, redirect }) => {
  const destino = site ? new URL('sitemap-index.xml', site).href : '/sitemap-index.xml';
  return redirect(destino, 301);
};
