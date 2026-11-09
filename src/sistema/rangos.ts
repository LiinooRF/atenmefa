/**
 * ¿Este resultado está fuera de su valor de referencia?
 *
 * El sistema tiene el valor y tiene el rango, y hasta ahora no los
 * comparaba: el bioanalista lo hacía de memoria, renglón por renglón. Es la
 * cuenta más barata que puede hacer el programa y la que más se agradece a
 * las siete de la tarde con veinte informes encima.
 *
 * LA REGLA DE ORO: ANTE LA DUDA, NO SE MARCA
 *
 * Pintar de rojo un valor normal es peor que no pintar nada. Un bioanalista
 * que ve una marca falsa deja de mirar las marcas, y entonces la que
 * importa también pasa de largo. Así que esto solo responde cuando el rango
 * se entiende sin ambigüedad; en cualquier otro caso devuelve `null` y la
 * pantalla no dice nada.
 *
 * Lo que NO se marca, a propósito:
 *   - Lo cualitativo: «NEGATIVO», «POSITIVO», «AMARILLA». No hay cómo
 *     comparar, y «positivo» no siempre es lo anormal.
 *   - Lo que no se pudo leer como número.
 *   - Un rango que no se entendió.
 */

/** Cómo quedó un valor frente a su referencia. */
export type Fuera = 'alto' | 'bajo' | null;

/**
 * Un número escrito como se escribe acá, y también como lo escribió su
 * archivo en inglés.
 *
 *   «3,50»      → 3.5    la coma es decimal
 *   «150.000»   → 150000 el punto separa miles: tres dígitos exactos detrás
 *   «2.5»       → 2.5    un punto con menos de tres dígitos detrás es decimal
 *   «1.234,56»  → 1234.56
 *
 * La distinción del punto importa de verdad: las plaquetas se informan
 * «150.000 - 450.000» y el fósforo «2.5 - 4.8». Tratar el punto siempre
 * como miles convertía 2.5 en 25 y marcaba como bajo cualquier fósforo
 * normal.
 */
export function aNumero(texto: string): number | null {
  const limpio = String(texto ?? '').trim().replace(/\s+/g, '');
  if (!limpio) return null;

  const soloNumero = limpio.match(/^[+-]?[\d.,]+$/);
  if (!soloNumero) return null;

  let t = limpio;
  if (t.includes(',')) {
    // Con coma, la coma manda: los puntos son miles.
    t = t.replace(/\./g, '').replace(',', '.');
  } else {
    // Sin coma: un punto seguido de exactamente tres dígitos es de miles,
    // y solo si hay algo delante. Si hay varios, todos lo son.
    t = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t;
  }

  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** El trozo del rango que le toca a este paciente. */
function paraElSexo(referencia: string, sexo: string | null | undefined): string {
  const partes = referencia.split('/');
  if (partes.length < 2) return referencia;

  const esHombre = /^m/i.test(String(sexo ?? '').trim()) && !/^mu/i.test(String(sexo ?? '').trim());
  const esMujer = /^f/i.test(String(sexo ?? '').trim()) || /^mu/i.test(String(sexo ?? '').trim());

  const suyo = partes.find((p) => {
    const t = p.toLowerCase();
    if (esHombre) return /hombre|masculino|varon/.test(t);
    if (esMujer) return /mujer|femenino/.test(t);
    return false;
  });

  /* Sin sexo conocido no se elige uno: se usa el rango MÁS ANCHO de los
     dos, que es lo único que no inventa una alarma. Un hematocrito de 37
     es bajo para un hombre y normal para una mujer; marcarlo sin saber
     quién es sería adivinar. */
  return suyo ?? referencia;
}

/** Un límite leído del texto, o null si no se entendió. */
interface Limites { min: number | null; max: number | null; }

function limitesDe(trozo: string): Limites | null {
  const t = trozo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[–—]/g, '-');

  // «Hombre: 12-17», «Adultos 2.5 - 4.8»: se tira el rótulo de adelante.
  const sinRotulo = t.replace(/^[^0-9<>+-]*:/, ' ');

  /* El número PEGADO a la palabra, no el último que aparezca: «Negativo
     hasta 0,015 gr/ 24 hrs» tiene dos números y el que manda es el
     primero. Tomando el último, el tope quedaba en 24 y no marcaba nada. */
  const tope = sinRotulo.match(/(?:hasta|menor\s*(?:que|a|de)?|inferior\s*a?|<=?)\s*([+-]?\d[\d.,]*)/);
  if (tope) {
    const n = aNumero(tope[1]);
    if (n !== null) return { min: null, max: n };
  }
  const piso = sinRotulo.match(/(?:mayor\s*(?:que|a|de)?|superior\s*a?|>=?)\s*([+-]?\d[\d.,]*)/);
  if (piso) {
    const n = aNumero(piso[1]);
    if (n !== null) return { min: n, max: null };
  }
  // «70 - 99», «3,50 - 6,0», «150.000 - 450.000»
  const rango = sinRotulo.match(/([+-]?\d[\d.,]*)\s*-\s*([+-]?\d[\d.,]*)/);
  if (rango) {
    const a = aNumero(rango[1]);
    const b = aNumero(rango[2]);
    if (a !== null && b !== null && b >= a) return { min: a, max: b };
  }
  return null;
}

/**
 * El rango que le corresponde a este paciente.
 *
 * Primero se mira si la referencia trae tramos por sexo o por edad. Si los
 * trae y se sabe a quién corresponde, se usa el suyo. Si los trae y NO se
 * sabe, se usa el más ancho de todos: un hematocrito de 37 es bajo para un
 * hombre y normal para una mujer, y marcarlo sin saber quién es sería
 * adivinar. Si no trae tramos, se lee la frase entera.
 */
function limitesPara(texto: string, sexo?: string | null): Limites | null {
  const partes = texto.split('/').map((p) => p.trim()).filter(Boolean);
  const conRotulo = partes.filter((p) => /hombre|mujer|masculino|femenino|varon|adulto|ni[ñn]o/i.test(p));

  if (partes.length > 1 && conRotulo.length > 0) {
    const suyo = paraElSexo(texto, sexo);
    if (suyo !== texto) {
      const l = limitesDe(suyo);
      if (l) return l;
    }

    const tramos = conRotulo.map(limitesDe).filter((x): x is Limites => x !== null);
    if (tramos.length > 1) {
      return {
        min: tramos.every((m) => m.min !== null)
          ? Math.min(...tramos.map((m) => m.min as number)) : null,
        max: tramos.every((m) => m.max !== null)
          ? Math.max(...tramos.map((m) => m.max as number)) : null,
      };
    }
    if (tramos.length === 1) return tramos[0];
  }

  return limitesDe(texto);
}

/**
 * El veredicto. `null` significa «no opino», y es la respuesta correcta
 * para todo lo cualitativo y para cualquier rango que no se entienda.
 */
export function fueraDeRango(
  valor: string,
  referencia: string,
  sexo?: string | null,
): Fuera {
  const v = aNumero(valor);
  if (v === null) return null;

  const texto = String(referencia ?? '').trim();
  if (!texto) return null;

  const lim = limitesPara(texto, sexo);
  if (!lim) return null;

  if (lim.max !== null && v > lim.max) return 'alto';
  if (lim.min !== null && v < lim.min) return 'bajo';
  return null;
}

/** Para el texto alternativo y el título, en palabras. */
export const comoSeDice = (f: Fuera) =>
  f === 'alto' ? 'por encima del valor de referencia'
  : f === 'bajo' ? 'por debajo del valor de referencia'
  : '';
