/**
 * Recibe las mediciones del sitio público.
 *
 * El nombre es corto a propósito: viaja en cada página y hay bloqueadores
 * que cortan por la palabra "analytics".
 *
 * Por qué existe, además del middleware: las páginas públicas de este
 * sitio se prerenderizan y el adaptador de Node las entrega desde el disco
 * sin pasar por el middleware, así que la única forma de saber que alguien
 * las abrió es que la propia página avise. Lo hace con navigator.sendBeacon
 * desde src/components/Medir.astro.
 *
 * Reglas de este endpoint, todas por ser público:
 *   · solo POST, y con un tope de tamaño: un endpoint abierto sin tope es
 *     una invitación a mandarle megabytes;
 *   · el tipo se compara contra una lista cerrada; no se guarda texto
 *     libre que llegue de afuera;
 *   · responde 204 sin cuerpo, también cuando descarta lo que llegó. No
 *     hay nada que contarle a quien lo esté probando, y el navegador
 *     tampoco escucha la respuesta de un beacon.
 *
 * El chequeo de origen vive en el middleware y se aplica acá: el beacon
 * del propio sitio manda Origin y pasa; el de otro sitio manda el suyo y
 * no.
 */
import type { APIRoute } from 'astro';
import {
  senasDe, registrarVisita, registrarEvento, esAccionDelNavegador, rutaNormalizada,
  esRutaDeVisita,
} from '../../sistema/lib/visitas';

export const prerender = false;

/** Alcanza de sobra para {tipo, ruta, origen}. */
const TOPE_BYTES = 1024;

const SIN_CUERPO = { status: 204 } as const;

/** La ruta que reporta la página. Se exige forma de ruta, no texto. */
const FORMA_DE_RUTA = /^\/[a-z0-9\-/._~%]{0,200}$/i;

export const POST: APIRoute = async (ctx) => {
  /* Ojo: Number(null) es 0 y Number.isInteger(0) es verdadero. Hay que
     comprobar que la cabecera EXISTE antes de convertirla. */
  const declarado = ctx.request.headers.get('content-length');
  if (declarado === null) return new Response(null, { status: 411 });

  const bytes = Number(declarado);
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > TOPE_BYTES) {
    return new Response(null, { status: 413 });
  }

  let mensaje: { tipo?: unknown; ruta?: unknown; origen?: unknown };
  try {
    mensaje = JSON.parse(await ctx.request.text());
  } catch {
    return new Response(null, SIN_CUERPO);
  }
  if (typeof mensaje !== 'object' || mensaje === null) {
    return new Response(null, SIN_CUERPO);
  }

  /* La ruta sale de la cabecera Referer, que la pone el navegador. Lo que
     reporta la página es el respaldo, por si alguna vez se endurece la
     política de referente y la cabecera llega sin camino. */
  const referente = ctx.request.headers.get('referer');
  let camino = '';
  if (referente) {
    try {
      camino = new URL(referente).pathname;
    } catch {
      camino = '';
    }
  }
  if (!camino && typeof mensaje.ruta === 'string' && FORMA_DE_RUTA.test(mensaje.ruta)) {
    camino = mensaje.ruta;
  }
  if (!camino) return new Response(null, SIN_CUERPO);

  const ruta = rutaNormalizada(camino);

  /* La misma regla que usa el middleware. Acá hace falta de verdad: la ruta
     sale de una cabecera, así que un aviso armado a mano puede decir
     /sistema/pacientes o /favicon.ico y eso no es una página del sitio. */
  if (!esRutaDeVisita(ruta)) return new Response(null, SIN_CUERPO);

  /* El origen lo tiene que reportar la página: para este aviso la cabecera
     Referer es nuestra propia página, no el sitio desde donde entró. Lo que
     llega se valida hasta dejar solo un dominio. */
  const origen = typeof mensaje.origen === 'string' ? mensaje.origen.slice(0, 200) : null;

  const senas = senasDe(ctx, ruta, origen);
  if (!senas) return new Response(null, SIN_CUERPO); // rastreador

  try {
    if (mensaje.tipo === 'vista') {
      await registrarVisita(senas);
    } else if (esAccionDelNavegador(mensaje.tipo)) {
      await registrarEvento(mensaje.tipo, senas);
    }
  } catch {
    /* Si la base no está, se pierde el conteo y nada más. */
  }

  return new Response(null, SIN_CUERPO);
};
