/**
 * El informe del laboratorio, abierto por el paciente (16-11).
 *
 * El correo ya no lleva una copia del informe armada aparte —«se envía por
 * mail algo que no es exactamente el examen»—: lleva el enlace a la
 * verificación. Ahí el paciente pone su cédula y el PIN, y de ahí pasa al
 * MISMO documento que se imprime en el laboratorio (components/sistema/
 * Documento.astro, en modo público), con el selector de media hoja o
 * compacto y para imprimir o guardar en PDF desde su teléfono.
 *
 * Pasar de la verificación al informe deja un permiso firmado por media
 * hora, para ESA atención y nada más: la cédula y el PIN no viajan en la
 * dirección ni se guardan. Nada queda en el servidor.
 *
 * Cuando el sistema crezca, el PDF adjunto saldrá de un servicio aparte
 * (Gotenberg o similar) que reciba este mismo HTML.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { exigido } from './entorno';

const NOMBRE = 'informe_lab';
const MINUTOS = 30;

const firma = (texto: string) =>
  createHmac('sha256', exigido('AUTH_SECRETO', 'cadena larga y aleatoria'))
    .update(`informe:${texto}`).digest('base64url');

/** Deja abierto el informe de esa atención por media hora. */
export function abrirInforme(cookies: AstroCookies, atencionId: string, seguro: boolean) {
  const vence = Date.now() + MINUTOS * 60_000;
  const base = `${atencionId}.${vence}`;
  cookies.set(NOMBRE, `${base}.${firma(base)}`, {
    path: '/verificar', httpOnly: true, sameSite: 'lax', secure: seguro, maxAge: MINUTOS * 60,
  });
}

/** Si quien pide el informe de esa atención pasó por la verificación. */
export function puedeVerInforme(cookies: AstroCookies, atencionId: string): boolean {
  const valor = cookies.get(NOMBRE)?.value ?? '';
  const partes = valor.split('.');
  if (partes.length !== 3) return false;
  const [id, vence, llegada] = partes;
  if (id !== atencionId || !(Number(vence) > Date.now())) return false;
  const esperada = Buffer.from(firma(`${id}.${vence}`));
  const recibida = Buffer.from(llegada);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}
