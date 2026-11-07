/**
 * La tasa del dólar, para poder leer los totales en bolívares.
 *
 * El centro cotiza en dólares y cobra en bolívares por taquilla, así que el
 * cierre del mes termina con dos totales que no se pueden sumar. Con una
 * tasa sí se puede, y entonces el número significa algo.
 *
 * TRES REGLAS, Y LAS TRES SON PARA QUE EL NÚMERO NO MIENTA
 *
 *   1. Solo la tasa oficial del BCV. Es la que vale para facturarle a una
 *      aseguradora y la única que alguien puede verificar si discute una
 *      factura.
 *
 *   2. Cada monto se convierte con la tasa de SU día, no con la de hoy. Una
 *      atención del 20 de octubre vale lo que valía el 20 de octubre; en
 *      Venezuela la diferencia entre una fecha y otra no es redondeo.
 *
 *   3. Lo que no se puede convertir se dice, no se omite. Si falta la tasa
 *      de un día, ese monto queda fuera del equivalente y la pantalla avisa
 *      cuántos quedaron fuera. Un total al que le faltan partes sin avisar
 *      es peor que no mostrar total.
 *
 * Lo convertido NO se guarda en ninguna parte: es una lectura, no un dato
 * del negocio. Lo que se cobró se cobró en su moneda y así queda.
 */
import { and, desc, gte, lte, sql } from 'drizzle-orm';
import { bd, esquema } from './base';
import { hoyEnCaracas } from './fechas';

const ORIGEN = 'https://ve.dolarapi.com/v1/dolares/oficial';

/** La moneda del catálogo. Lo que ya está en bolívares no se convierte. */
export const MONEDA_BASE = 'USD';
export const MONEDA_LOCAL = 'VES';

export interface Tasa {
  /** El día que el BCV publicó este valor. */
  fecha: string;
  /** Cuántos bolívares vale un dólar. */
  bolivares: number;
}

/* ------------------------------------------------------------------
   Traerla.
   ------------------------------------------------------------------ */

/**
 * Último intento contra la API, sea que haya salido bien o mal.
 *
 * Vive en memoria del proceso a propósito: si el servicio está caído, lo que
 * hay que evitar es pedirle lo mismo en cada carga de pantalla. Al reiniciar
 * se pierde, y está bien: reintentar una vez de más no le hace daño a nadie.
 */
let ultimoIntento = 0;
const ESPERA_ENTRE_INTENTOS = 10 * 60 * 1000;

/** Lo que publica el BCV hoy, o null si no se pudo. Nunca lanza. */
async function traerDelBanco(): Promise<Tasa | null> {
  try {
    const r = await fetch(ORIGEN, {
      signal: AbortSignal.timeout(6000),
      headers: { accept: 'application/json' },
    });
    if (!r.ok) return null;

    const d = (await r.json()) as { promedio?: unknown; fechaActualizacion?: unknown };
    const bolivares = Number(d.promedio);
    if (!Number.isFinite(bolivares) || bolivares <= 0) return null;

    /* La fecha viene con la zona de Caracas puesta ("...-04:00"), así que el
       día es el que sale de esa zona y no el del servidor. */
    const cuando = new Date(String(d.fechaActualizacion ?? ''));
    if (Number.isNaN(cuando.getTime())) return null;
    const fecha = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(cuando);

    /* Una fecha futura solo puede ser un error de la fuente o del reloj, y
       guardarla taparía la tasa buena de hoy para siempre. */
    if (fecha > hoyEnCaracas()) return null;

    return { fecha, bolivares };
  } catch {
    return null; // sin red, sin servicio, o tardó demasiado
  }
}

/**
 * Se asegura de tener lo último que publicó el BCV. Se llama desde las
 * pantallas que muestran plata; si falla, no pasa nada: se sigue con lo que
 * haya guardado y la pantalla lo dice.
 */
export async function asegurarTasa(): Promise<void> {
  const [ultima] = await bd
    .select({ fecha: esquema.tasa.fecha })
    .from(esquema.tasa)
    .orderBy(desc(esquema.tasa.fecha))
    .limit(1);

  // Lo de hoy ya está, o lo de ayer y el BCV todavía no publicó: nada que hacer.
  if (ultima && ultima.fecha >= hoyEnCaracas()) return;

  const ahora = Date.now();
  if (ahora - ultimoIntento < ESPERA_ENTRE_INTENTOS) return;
  ultimoIntento = ahora;

  const fresca = await traerDelBanco();
  if (!fresca) return;

  /* Nunca se pisa una fila: lo que se guardó para un día es lo que había ese
     día, y reescribirlo cambiaría a destiempo informes ya emitidos. */
  await bd
    .insert(esquema.tasa)
    .values({ fecha: fresca.fecha, bolivares: String(fresca.bolivares) })
    .onConflictDoNothing();
}

/* ------------------------------------------------------------------
   Usarla.
   ------------------------------------------------------------------ */

const comoTasa = (f: { fecha: string; bolivares: string }): Tasa => ({
  fecha: f.fecha,
  bolivares: Number(f.bolivares),
});

/**
 * La tasa que le toca a una fecha: la última publicada ese día o antes.
 * Así es como funciona de verdad —lo del sábado se liquida con la del
 * viernes— y así una atención vieja se convierte con lo que valía entonces.
 */
export async function tasaPara(fecha: string): Promise<Tasa | null> {
  const [f] = await bd
    .select({ fecha: esquema.tasa.fecha, bolivares: esquema.tasa.bolivares })
    .from(esquema.tasa)
    .where(lte(esquema.tasa.fecha, fecha))
    .orderBy(desc(esquema.tasa.fecha))
    .limit(1);
  return f ? comoTasa(f) : null;
}

/**
 * Lo mismo para muchas fechas de una sola consulta. El cierre del mes tiene
 * una fecha por atención y pedirlas de a una sería una consulta por caso.
 */
export async function tasasPara(fechas: readonly string[]): Promise<Map<string, Tasa>> {
  const pedidas = [...new Set(fechas)].filter(Boolean).sort();
  const salida = new Map<string, Tasa>();
  if (!pedidas.length) return salida;

  /* Desde la última publicada ANTES de la fecha más vieja: si el mes empieza
     un domingo, la tasa que le toca a ese día se publicó en noviembre del
     mes anterior y quedaría fuera de un rango que arranque en la primera. */
  const [piso] = await bd
    .select({ fecha: esquema.tasa.fecha })
    .from(esquema.tasa)
    .where(lte(esquema.tasa.fecha, pedidas[0]))
    .orderBy(desc(esquema.tasa.fecha))
    .limit(1);

  const filas = await bd
    .select({ fecha: esquema.tasa.fecha, bolivares: esquema.tasa.bolivares })
    .from(esquema.tasa)
    .where(
      and(
        gte(esquema.tasa.fecha, piso?.fecha ?? pedidas[0]),
        lte(esquema.tasa.fecha, pedidas[pedidas.length - 1]),
      ),
    )
    .orderBy(esquema.tasa.fecha);

  if (!filas.length) return salida;

  /* Las dos listas están ordenadas, así que se recorren juntas: para cada
     fecha pedida se avanza hasta la última tasa que no la pase. */
  let i = 0;
  let vigente: Tasa | null = null;
  for (const fecha of pedidas) {
    while (i < filas.length && filas[i].fecha <= fecha) vigente = comoTasa(filas[i++]);
    if (vigente) salida.set(fecha, vigente);
  }
  return salida;
}

/** Dólares a bolívares, al centavo. */
export const enBolivares = (dolares: number, tasa: Tasa) =>
  Math.round(dolares * tasa.bolivares * 100) / 100;

export interface MontoYMoneda {
  moneda: string;
  total: number;
}

export interface Equivalente {
  /** La suma en bolívares de todo lo que se pudo convertir. */
  bolivares: number;
  /** Cuántos montos quedaron fuera por no tener la tasa de su día. */
  sinTasa: number;
  /** De qué días salieron las tasas usadas, para poder decirlo en pantalla. */
  dias: string[];
}

/**
 * Junta en bolívares montos de varias monedas y de varias fechas.
 *
 * Lo que ya está en bolívares entra tal cual. Lo que está en dólares se
 * convierte con la tasa de su fecha. Lo que no tiene tasa NO se convierte y
 * se cuenta aparte, para que la pantalla pueda decir que el equivalente está
 * incompleto en vez de mostrar un total al que le faltan partes.
 *
 * Una moneda que no sea ni dólar ni bolívar se cuenta como no convertible:
 * inventarle una tasa sería peor que decir que no se puede.
 */
export function equivalenteEnBolivares(
  partidas: readonly { fecha: string; totales: readonly MontoYMoneda[] }[],
  tasas: ReadonlyMap<string, Tasa>,
): Equivalente {
  let bolivares = 0;
  let sinTasa = 0;
  const dias = new Set<string>();

  for (const partida of partidas) {
    for (const monto of partida.totales) {
      if (!Number.isFinite(monto.total) || monto.total === 0) continue;

      if (monto.moneda === MONEDA_LOCAL) {
        bolivares += monto.total;
        continue;
      }
      if (monto.moneda !== MONEDA_BASE) {
        sinTasa += 1;
        continue;
      }
      const tasa = tasas.get(partida.fecha);
      if (!tasa) {
        sinTasa += 1;
        continue;
      }
      bolivares += enBolivares(monto.total, tasa);
      dias.add(tasa.fecha);
    }
  }

  return {
    bolivares: Math.round(bolivares * 100) / 100,
    sinTasa,
    dias: [...dias].sort(),
  };
}

/**
 * Lo mismo pero pidiendo las tasas por su cuenta, que es como hay que
 * usarlo desde una pantalla.
 *
 * equivalenteEnBolivares() recibe el mapa ya armado para poder probarse sin
 * base de datos, y eso deja una trampa: si el mapa no trae EXACTAMENTE las
 * fechas que se van a convertir, lo que falte se cuenta como "sin tasa" y el
 * total sale corto sin que nada falle. Pasó armando esto. Acá las fechas
 * salen de las mismas partidas, así que no puede desalinearse.
 */
export async function equivalenteDe(
  partidas: readonly { fecha: string; totales: readonly MontoYMoneda[] }[],
): Promise<Equivalente> {
  const tasas = await tasasPara(partidas.map((p) => p.fecha));
  return equivalenteEnBolivares(partidas, tasas);
}

/** Cuántas tasas hay guardadas y desde cuándo, para la pantalla de ajustes. */
export async function cuantasTasas() {
  const [f] = await bd
    .select({
      cuantas: sql<number>`count(*)::int`,
      desde: sql<string | null>`min(fecha)::text`,
      hasta: sql<string | null>`max(fecha)::text`,
    })
    .from(esquema.tasa);
  return f;
}
