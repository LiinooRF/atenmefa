/**
 * Teléfonos venezolanos, para poder abrir un chat de WhatsApp.
 *
 * En recepción el mismo número se escribe de seis maneras: 0414-1234567,
 * 04141234567, 414 1234567, +58 414 1234567, (0414) 123.45.67. wa.me
 * necesita una sola: código de país y número, sin signos y sin el cero.
 *
 * Sin esto el botón abría un chat con un número inexistente, que es peor
 * que no tener botón: la persona cree que avisó y no avisó.
 */

/** Los códigos de celular que se usan en Venezuela. */
const CELULARES = ['412', '414', '416', '424', '426'];

/**
 * El número en el formato que entiende wa.me: 58 seguido de diez dígitos.
 * Devuelve null si lo escrito no puede ser un número venezolano, en vez de
 * armar uno a la fuerza.
 */
export function paraWhatsApp(crudo: string | null | undefined): string | null {
  let n = String(crudo ?? '').replace(/\D/g, '');
  if (!n) return null;

  // Ya viene con el código de país.
  if (n.startsWith('58')) n = n.slice(2);
  // 0414… → 414…
  if (n.startsWith('0')) n = n.slice(1);

  /* Diez dígitos: tres de código y siete de abonado. Un fijo de Ciudad
     Bolívar (0285) tiene la misma forma, así que no se exige que sea
     celular; WhatsApp sobre fijo no funciona, pero inventar la regla acá
     dejaría afuera números legítimos de otras operadoras. Lo que sí se
     descarta es lo que no tiene largo de número. */
  if (n.length !== 10) return null;

  return `58${n}`;
}

/** Si parece un celular, que es donde WhatsApp de verdad va a existir. */
export const esCelular = (crudo: string | null | undefined) => {
  const n = paraWhatsApp(crudo);
  return Boolean(n && CELULARES.includes(n.slice(2, 5)));
};

/** Como se lee en pantalla: 0414-1234567. */
export function comoSeLee(crudo: string | null | undefined): string {
  const n = paraWhatsApp(crudo);
  if (!n) return String(crudo ?? '').trim();
  return `0${n.slice(2, 5)}-${n.slice(5)}`;
}

/**
 * El enlace que abre el chat con el mensaje ya escrito.
 *
 * El documento NO viaja por acá. wa.me abre la conversación y deja el texto
 * puesto; adjuntar un archivo desde un enlace no existe, y el cliente llegó
 * a la misma conclusión por su cuenta: «ese botón no debería enviar el
 * documento de una vez, yo creo que ese botón es para abrir el chat y ya, y
 * algún mensajito predefinido». Por eso el mensaje lleva la dirección de
 * verificación: ahí sí está el informe.
 */
export function enlaceDeWhatsApp(numero: string, mensaje: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
