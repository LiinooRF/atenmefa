import type { APIRoute } from 'astro';
import { auth } from '../../sistema/lib/auth';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  await auth.api.signOut({ headers: ctx.request.headers });
  return ctx.redirect('/sistema/entrar');
};
