import { defineMiddleware } from 'astro:middleware';
import { auth } from './sistema/lib/auth';

/**
 * Guardia de /sistema/. Todo lo de adentro exige sesión; el resto del
 * sitio es estático y no toca la base.
 */
export const onRequest = defineMiddleware(async (ctx, siguiente) => {
  const ruta = ctx.url.pathname;

  if (!ruta.startsWith('/sistema')) return siguiente();

  // Las rutas de Better Auth se atienden solas.
  if (ruta.startsWith('/sistema/auth')) return siguiente();

  const sesion = await auth.api.getSession({ headers: ctx.request.headers });
  const usuario = sesion?.user ?? null;
  ctx.locals.usuario = usuario && usuario.activo !== false ? usuario : null;

  const esEntrar = ruta === '/sistema/entrar' || ruta === '/sistema/entrar/';
  if (!ctx.locals.usuario && !esEntrar) return ctx.redirect('/sistema/entrar');
  if (ctx.locals.usuario && esEntrar) return ctx.redirect('/sistema');

  const respuesta = await siguiente();
  // El sistema no se indexa nunca, pase lo que pase con robots.txt.
  respuesta.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return respuesta;
});
