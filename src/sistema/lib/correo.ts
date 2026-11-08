/**
 * Envío de correo por Mailgun.
 *
 * NACE APAGADO, Y A PROPÓSITO
 *
 * Tener la clave cargada no es permiso para mandar nada. Hacen falta las
 * dos cosas: las credenciales y CORREO_ACTIVO=1. Sin el interruptor, el
 * botón del panel hace todo el camino —valida la dirección, arma el
 * mensaje— y en vez de enviarlo dice qué habría enviado. Es un sistema que
 * le escribe a pacientes de un centro de salud: la primera vez que mande
 * algo de verdad tiene que ser porque alguien lo decidió.
 *
 * MANUAL, NUNCA AUTOMÁTICO
 *
 * El cliente lo pidió explícito: «el botón de Mailgun debe ser manual, y
 * confirmando el correo del paciente registrado». No hay ningún camino que
 * envíe por su cuenta al guardar un resultado o cerrar una atención.
 *
 * NADA QUEDA GUARDADO
 *
 * El mensaje va con el informe en el cuerpo, no como PDF adjunto. Dos
 * razones y las dos importan: no hay que generar ni guardar un archivo en
 * el disco de la VPS —que es la regla del proyecto—, y el informe sigue
 * saliendo de los mismos datos que la pantalla, sin una segunda plantilla
 * que se desincronice.
 */
import { entorno } from './entorno';

export const BASE_POR_OMISION = 'https://api.mailgun.net';

export interface Config {
  clave: string;
  dominio: string;
  base: string;
  de: string;
  /** Si de verdad se envía. Sin esto se simula. */
  activo: boolean;
  /** El sandbox de Mailgun solo entrega a direcciones autorizadas. */
  esSandbox: boolean;
}

/** Lo que haya configurado, o null si falta lo indispensable. */
export function configDelCorreo(): Config | null {
  const clave = entorno('MAILGUN_CLAVE');
  const dominio = entorno('MAILGUN_DOMINIO');
  if (!clave || !dominio) return null;

  return {
    clave,
    dominio,
    base: (entorno('MAILGUN_BASE') ?? BASE_POR_OMISION).replace(/\/$/, ''),
    de: entorno('MAILGUN_DE') ?? `Atenmefa <atenmefa@${dominio}>`,
    activo: entorno('CORREO_ACTIVO') === '1',
    esSandbox: dominio.startsWith('sandbox'),
  };
}

/**
 * Una dirección usable.
 *
 * No valida "de verdad" —eso solo lo hace el servidor del otro lado— pero
 * descarta lo que seguro no es: sin arroba, con espacios, sin punto en el
 * dominio. Alcanza para no gastar un envío en un error de tipeo.
 */
export function correoUsable(crudo: unknown): string | null {
  const texto = String(crudo ?? '').trim().toLowerCase();
  if (!texto || /\s/.test(texto)) return null;
  if (!/^[^@]+@[^@]+\.[a-z]{2,}$/.test(texto)) return null;
  return texto;
}

export type Resultado =
  | { estado: 'enviado'; id: string }
  | { estado: 'simulado'; motivo: string }
  | { estado: 'falla'; motivo: string };

/**
 * Manda un mensaje. Devuelve qué pasó en vez de lanzar: el que llama es una
 * pantalla y necesita poder contarlo.
 */
export async function enviarCorreo(mensaje: {
  a: string;
  asunto: string;
  html: string;
  texto: string;
}): Promise<Resultado> {
  const cfg = configDelCorreo();
  if (!cfg) {
    return { estado: 'simulado', motivo: 'Falta configurar el correo (MAILGUN_CLAVE y MAILGUN_DOMINIO).' };
  }
  if (!cfg.activo) {
    return {
      estado: 'simulado',
      motivo: 'El envío de correo está apagado. Se prende con CORREO_ACTIVO=1.',
    };
  }

  const cuerpo = new URLSearchParams({
    from: cfg.de,
    to: mensaje.a,
    subject: mensaje.asunto,
    html: mensaje.html,
    text: mensaje.texto,
  });

  try {
    const r = await fetch(`${cfg.base}/v3/${cfg.dominio}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${cfg.clave}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: cuerpo,
      signal: AbortSignal.timeout(15_000),
    });

    const texto = await r.text();
    if (!r.ok) {
      /* El sandbox contesta 400 con este motivo cuando la dirección no está
         autorizada, y es el error que de verdad va a aparecer mientras no
         exista el dominio propio. Se traduce para que en la pantalla no
         quede un mensaje en inglés que parece una falla del sistema. */
      const noAutorizada = /not authorized|authorized recipient/i.test(texto);
      return {
        estado: 'falla',
        motivo: noAutorizada
          ? 'Mailgun rechazó la dirección: el dominio de pruebas solo entrega a los correos autorizados en su panel.'
          : `Mailgun contestó ${r.status}: ${texto.slice(0, 200)}`,
      };
    }

    let id = '';
    try { id = String(JSON.parse(texto).id ?? ''); } catch { /* sin id, da igual */ }
    return { estado: 'enviado', id };
  } catch (e) {
    return {
      estado: 'falla',
      motivo: e instanceof Error ? `No se pudo contactar a Mailgun: ${e.message}` : 'No se pudo contactar a Mailgun.',
    };
  }
}
