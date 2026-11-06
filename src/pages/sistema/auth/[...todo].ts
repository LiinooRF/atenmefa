import type { APIRoute } from 'astro';
import { auth } from '../../../sistema/lib/auth';

export const prerender = false;

/** Better Auth atiende todo bajo /sistema/auth/. */
export const ALL: APIRoute = ({ request }) => auth.handler(request);
