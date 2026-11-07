/**
 * El documento con el que se identifica a un paciente.
 *
 * La cédula es el camino normal y no cambia. Lo que se agrega acá es la
 * salida para cuando no hay cédula, que en un centro de salud pasa:
 * extranjeros con pasaporte, recién nacidos que todavía no la tienen, y
 * alguien que llega inconsciente sin nada encima.
 *
 * El documento alternativo es SECUNDARIO a propósito: no se ofrece en la
 * pantalla, hay que abrirlo. Si estuviera al lado de la cédula, en una
 * recepción apurada se usaría por comodidad y el registro se llenaría de
 * personas imposibles de cruzar con su seguro.
 *
 * Por qué la llave lleva prefijo, salvo la cédula: cedula_busca es única y
 * un pasaporte de puros números —los hay— chocaría con la cédula de otra
 * persona. Todo lo que no es cédula va prefijado; la cédula se queda con sus
 * dígitos pelados para que nada de lo ya guardado cambie.
 */

export const TIPOS = ['cedula', 'pasaporte', 'partida', 'interno'] as const;
export type TipoDocumento = (typeof TIPOS)[number];

export const esTipo = (v: unknown): v is TipoDocumento =>
  typeof v === 'string' && (TIPOS as readonly string[]).includes(v);

/** Cómo se le dice a cada uno en pantalla. */
export const ROTULO: Record<TipoDocumento, string> = {
  cedula: 'Cédula',
  pasaporte: 'Pasaporte',
  partida: 'Partida de nacimiento',
  interno: 'Sin documento',
};

/** La ayuda que acompaña a cada uno en el formulario. */
export const PISTA: Record<TipoDocumento, string> = {
  cedula: 'Con o sin puntos, con o sin letra. Da igual cómo se escriba.',
  pasaporte: 'Como viene impreso, con sus letras y números.',
  partida: 'El número de la partida de nacimiento.',
  interno: 'El sistema le asigna un número para poder registrar la atención.',
};

const PREFIJO: Record<TipoDocumento, string> = {
  cedula: '',
  pasaporte: 'P:',
  partida: 'N:',
  interno: 'SD:',
};

export const soloDigitos = (s: string) => (s ?? '').replace(/\D/g, '');

/** Letras y números en mayúscula, sin acentos ni separadores. */
const alfanumerico = (s: string) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/**
 * La llave con la que se busca y con la que se evita el duplicado.
 * Devuelve '' si el documento no tiene nada aprovechable, y quien llama
 * decide qué hacer con eso.
 */
export function llaveDe(tipo: TipoDocumento, documento: string): string {
  if (tipo === 'cedula') return soloDigitos(documento);
  /* El interno se guarda por su número y no por cómo se escribió, para que
     SD-000007, SD-7 y sd000007 sean la misma persona. */
  if (tipo === 'interno') {
    const n = numeroInterno(documento);
    return n ? `${PREFIJO.interno}${n}` : '';
  }
  const limpio = alfanumerico(documento);
  return limpio ? `${PREFIJO[tipo]}${limpio}` : '';
}

/** De vuelta: de la llave guardada al tipo que la generó. */
export function tipoDeLlave(llave: string): TipoDocumento {
  for (const tipo of TIPOS) {
    if (tipo !== 'cedula' && llave.startsWith(PREFIJO[tipo])) return tipo;
  }
  return 'cedula';
}

/**
 * ¿Alcanza para abrir el formulario?
 *
 * La cédula venezolana más corta en circulación tiene 6 dígitos, y ese
 * mínimo es el que evita que un dedazo de dos teclas abra una atención a
 * nombre de nadie. Un pasaporte puede ser más corto y traer letras, así que
 * se le pide lo mismo pero contando letras y números.
 */
export function alcanza(tipo: TipoDocumento, documento: string): boolean {
  if (tipo === 'interno') return Boolean(numeroInterno(documento));
  const util = tipo === 'cedula' ? soloDigitos(documento) : alfanumerico(documento);
  return util.length >= 6;
}

/** Cómo se escribe un documento interno: SD-000001. */
export const formatearInterno = (n: number) => `SD-${String(n).padStart(6, '0')}`;

/** Y cómo se reconoce uno, venga de la URL o del formulario. */
export function numeroInterno(documento: string): number | null {
  const m = /^SD-?(\d{1,9})$/i.exec((documento ?? '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Cómo nombrar el documento de alguien en pantalla.
 * El interno se dice como lo que es: no es un documento, es una etiqueta
 * que puso el centro, y pasarlo por documento confundiría a quien lo lea.
 */
export function comoSeLee(tipo: TipoDocumento, documento: string): string {
  if (tipo === 'cedula') return documento;
  if (tipo === 'interno') return `${documento} · sin documento`;
  return `${ROTULO[tipo]} ${documento}`;
}
