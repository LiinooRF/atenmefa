/**
 * Guardia de permisos para las páginas del sistema.
 *
 * Se usa al principio del frontmatter:
 *
 *   const corte = exigir(Astro, 'editar_catalogo');
 *   if (corte) return corte;
 *
 * Devuelve una respuesta cuando hay que cortar, o null cuando se puede
 * seguir. Que sea una sola línea importa: un permiso que es incómodo de
 * comprobar termina sin comprobarse.
 */
import type { APIContext } from 'astro';
import { puede, porQueNo, type Permiso } from './permisos';

export function exigir(ctx: APIContext, permiso: Permiso): Response | null {
  const usuario = ctx.locals.usuario;
  if (!usuario) return ctx.redirect('/sistema/entrar');
  if (puede(usuario.rol as string, permiso)) return null;

  const url = new URL('/sistema/sin-permiso', ctx.url.origin);
  url.searchParams.set('motivo', porQueNo[permiso]);
  url.searchParams.set('volver', ctx.url.pathname);
  return ctx.redirect(url.pathname + url.search);
}

/** Igual, pero para endpoints que devuelven datos y no pantallas. */
export function exigirEnApi(ctx: APIContext, permiso: Permiso): Response | null {
  const usuario = ctx.locals.usuario;
  if (!usuario) return new Response('Sin sesión', { status: 401 });
  if (puede(usuario.rol as string, permiso)) return null;
  return new Response(porQueNo[permiso], { status: 403 });
}
