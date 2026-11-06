/**
 * Cobro de una atención: el catálogo de servicios y los renglones que se le
 * cargan al caso.
 *
 * Vive aparte de las pantallas porque la misma cuenta la miran tres: la
 * carga del cobro, la ficha del caso y el cierre del mes.
 *
 * Lo que manda sobre este archivo es la metáfora con que el cliente explicó
 * la pieza: fue a la bodega por carne, pero el médico mandó también sal y
 * adobo, y hay que saber quién paga la sal. De ahí dos cosas:
 *   · cada renglón lleva su propio pagador, no la atención completa;
 *   · el renglón guarda su propia descripción y su propio precio, copiados
 *     del catálogo en el momento de cargarlo. Si mañana sube la lista, lo
 *     ya facturado no se mueve.
 */
import { and, asc, eq } from 'drizzle-orm';
import { bd, esquema } from './base';
import { esIdentificador } from './atenciones';

export type Pagador = 'paciente' | 'aseguradora' | 'empresa';

/** Las seis que nombró el cliente. El orden es el de la lista en pantalla. */
export const CATEGORIAS = [
  { clave: 'consulta', rotulo: 'Consulta' },
  { clave: 'laboratorio', rotulo: 'Laboratorio' },
  { clave: 'interconsulta', rotulo: 'Interconsulta' },
  { clave: 'traslado', rotulo: 'Traslado' },
  { clave: 'procedimiento', rotulo: 'Procedimiento' },
  { clave: 'equipo', rotulo: 'Equipo o material' },
] as const;

export const PAGADORES = [
  { clave: 'paciente', rotulo: 'El paciente', frase: 'Lo paga el paciente' },
  { clave: 'aseguradora', rotulo: 'La aseguradora', frase: 'Lo paga el seguro' },
  { clave: 'empresa', rotulo: 'La empresa', frase: 'Lo paga la empresa' },
] as const;

/**
 * El centro cotiza en dólares y así lo pidió el cliente. El bolívar queda
 * disponible para lo que se cobre en taquilla, pero nunca se suman dos
 * monedas en un mismo total.
 */
export const MONEDAS = ['USD', 'VES'] as const;

export const esPagador = (v: unknown): v is Pagador =>
  PAGADORES.some((p) => p.clave === v);

export const esCategoria = (v: unknown) => CATEGORIAS.some((c) => c.clave === v);

export const esMoneda = (v: unknown) => MONEDAS.some((m) => m === v);

/** Para categorías cargadas antes de un cambio de lista: se muestra tal cual. */
export const rotuloCategoria = (clave: string) =>
  CATEGORIAS.find((c) => c.clave === clave)?.rotulo ?? clave;

export const frasePagador = (clave: string) =>
  PAGADORES.find((p) => p.clave === clave)?.frase ?? clave;

/**
 * Quién paga por omisión. Si el caso vino por un seguro, lo normal es que
 * el renglón se le cargue al seguro; la excepción la marca quien cobra.
 */
export const pagadorSugerido = (aseguradora?: string | null): Pagador =>
  aseguradora ? 'aseguradora' : 'paciente';

/** Monto con separadores de Venezuela: coma decimal y punto de miles. */
export const dinero = (valor: number | string) =>
  new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(valor) || 0);

/**
 * La cantidad se guarda con dos decimales porque hay cosas que se cobran
 * por fracción, pero "1,00 consulta" se lee mal: los enteros van sin coma.
 */
export const cantidadVista = (valor: number | string) => {
  const n = Number(valor) || 0;
  return Number.isInteger(n) ? String(n) : dinero(n);
};

/** Miles a la venezolana sin decimales: 1.250, 1.250.000. */
const SOLO_MILES = /^\d{1,3}(\.\d{3})+$/;

/**
 * Lee un monto escrito a mano. Acá se teclea "12,50" tanto como "12.50", y
 * a veces "1.250,00": si vienen los dos separadores, el punto es de miles.
 * Devuelve null si no es un número usable, para que la pantalla avise en
 * lugar de guardar un cero silencioso.
 *
 * Con el punto solo hay que decidir: "12.50" es un decimal tecleado a la
 * gringa, pero "1.250" es mil doscientos cincuenta, que es como se escribe
 * un precio en bolívares. El punto seguido de grupos de exactamente tres
 * cifras es un millar; cualquier otra cosa es un decimal. Sin esa
 * distinción un oxígeno de 1.250 Bs entraba a la cuenta como 1,25.
 */
export function montoDe(texto: unknown): number | null {
  const bruto = String(texto ?? '').trim();
  if (!bruto) return null;

  const limpio = bruto.includes(',')
    ? bruto.replace(/\./g, '').replace(',', '.')
    : SOLO_MILES.test(bruto)
      ? bruto.replace(/\./g, '')
      : bruto;

  const valor = Number(limpio);
  if (!Number.isFinite(valor) || valor < 0) return null;
  // numeric(14,2) en la base: más de dos decimales no se podrían guardar.
  return Math.round(valor * 100) / 100;
}

/** Lo mismo para la cantidad, que además no puede ser cero. */
export function cantidadDe(texto: unknown): number | null {
  const valor = montoDe(texto ?? '1');
  if (valor === null || valor === 0) return null;
  return valor;
}

/** Como lo guarda numeric: texto con dos decimales. */
const aColumna = (valor: number) => valor.toFixed(2);

/** Cierra un monto a dos decimales. No hay medios centavos que cobrar. */
const centavos = (monto: number) => Math.round(monto * 100) / 100;

/**
 * Lo que cuesta un renglón: cantidad por precio, cerrado a dos decimales
 * en el renglón y no al final de la suma.
 *
 * Importa cuando la cantidad es fraccionada: 1,5 × 35,55 = 53,325. Si cada
 * renglón se redondea y el total no, dos férulas muestran 53,32 y 53,32 en
 * la tabla y 106,65 en la cuenta, un centavo que nadie puede explicar. El
 * cierre del mes redondea igual, así que la pantalla y la planilla dicen la
 * misma cifra.
 */
export const montoRenglon = (cantidad: number | string, precio: number | string) =>
  centavos(Number(cantidad) * Number(precio));

interface ParaSumar {
  cantidad: string;
  precio: string;
  moneda: string;
  paga: string;
}

export interface Subtotal {
  clave: string;
  rotulo: string;
  monto: number;
}

export interface CuentaPorMoneda {
  moneda: string;
  total: number;
  renglones: number;
  pagadores: Subtotal[];
}

/**
 * Totales de una lista de renglones, separados por moneda. Sumar dólares
 * con bolívares daría un número que no significa nada, así que cada moneda
 * lleva su propia cuenta y su propio desglose por pagador.
 */
export function resumir(renglones: readonly ParaSumar[]): CuentaPorMoneda[] {
  const cuentas = new Map<string, { total: number; renglones: number; pagadores: Map<string, number> }>();

  for (const r of renglones) {
    const monto = montoRenglon(r.cantidad, r.precio);
    if (!Number.isFinite(monto)) continue;

    const cuenta = cuentas.get(r.moneda) ?? { total: 0, renglones: 0, pagadores: new Map() };
    cuenta.total = centavos(cuenta.total + monto);
    cuenta.renglones += 1;
    cuenta.pagadores.set(r.paga, centavos((cuenta.pagadores.get(r.paga) ?? 0) + monto));
    cuentas.set(r.moneda, cuenta);
  }

  return [...cuentas.entries()]
    // El dólar primero porque es la moneda del catálogo.
    .sort(([a], [b]) => (a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b)))
    .map(([moneda, cuenta]) => ({
      moneda,
      total: cuenta.total,
      renglones: cuenta.renglones,
      // El orden de PAGADORES, no el de carga: la cuenta se lee siempre igual.
      pagadores: PAGADORES.filter((p) => cuenta.pagadores.has(p.clave)).map((p) => ({
        clave: p.clave,
        rotulo: p.rotulo,
        monto: cuenta.pagadores.get(p.clave)!,
      })),
    }));
}

/* ---------- catálogo ---------- */

/** El catálogo completo. Los desactivados van al final, no se esconden. */
export async function catalogo(incluirInactivos = false) {
  const filas = await bd
    .select()
    .from(esquema.servicio)
    .where(incluirInactivos ? undefined : eq(esquema.servicio.activo, true))
    .orderBy(asc(esquema.servicio.nombre));

  const orden = (c: string) => {
    const i = CATEGORIAS.findIndex((x) => x.clave === c);
    return i === -1 ? CATEGORIAS.length : i;
  };

  return filas.sort(
    (a, b) =>
      Number(b.activo) - Number(a.activo) ||
      orden(a.categoria) - orden(b.categoria) ||
      a.nombre.localeCompare(b.nombre, 'es'),
  );
}

export type Servicio = Awaited<ReturnType<typeof catalogo>>[number];

/** Agrupado por categoría, para el selector y para la lista del catálogo. */
export function porCategoria(servicios: readonly Servicio[]) {
  const grupos: { clave: string; rotulo: string; servicios: Servicio[] }[] = CATEGORIAS.map((c) => ({
    clave: c.clave as string,
    rotulo: c.rotulo,
    servicios: servicios.filter((s) => s.categoria === c.clave),
  }));

  // Lo que quedó fuera de las seis categorías conocidas no se pierde de vista.
  const sueltos = servicios.filter((s) => !esCategoria(s.categoria));
  if (sueltos.length) grupos.push({ clave: 'otros', rotulo: 'Otros', servicios: sueltos });

  return grupos.filter((g) => g.servicios.length > 0);
}

interface DatosServicio {
  nombre: unknown;
  categoria: unknown;
  precio: unknown;
  moneda: unknown;
}

/** Valida lo que llegó del formulario del catálogo. Lanza con el motivo. */
function revisarServicio(datos: DatosServicio) {
  const nombre = String(datos.nombre ?? '').trim();
  if (nombre.length < 3) throw new Error('El nombre del servicio hace falta, con al menos tres letras.');

  const categoria = String(datos.categoria ?? '');
  if (!esCategoria(categoria)) throw new Error('Hay que elegir una categoría de la lista.');

  const precio = montoDe(datos.precio);
  if (precio === null) throw new Error('El precio tiene que ser un monto, por ejemplo 35,00.');

  const moneda = String(datos.moneda ?? 'USD');
  if (!esMoneda(moneda)) throw new Error('La moneda tiene que ser USD o VES.');

  return { nombre, categoria, precio: aColumna(precio), moneda };
}

export async function crearServicio(datos: DatosServicio) {
  const [creado] = await bd
    .insert(esquema.servicio)
    .values(revisarServicio(datos))
    .returning({ id: esquema.servicio.id, nombre: esquema.servicio.nombre });
  return creado;
}

export async function guardarServicio(id: string, datos: DatosServicio) {
  /* Un id que no tiene forma de uuid hace que Postgres rechace el cast y la
     pantalla termina en error de servidor. Un enlace viejo se contesta como
     lo que es: un servicio que ya no está. */
  if (!esIdentificador(id)) throw new Error('Ese servicio ya no está en el catálogo.');

  const [guardado] = await bd
    .update(esquema.servicio)
    .set(revisarServicio(datos))
    .where(eq(esquema.servicio.id, id))
    .returning({ id: esquema.servicio.id, nombre: esquema.servicio.nombre });

  if (!guardado) throw new Error('Ese servicio ya no está en el catálogo.');
  return guardado;
}

/**
 * Un servicio no se borra: se desactiva. Puede estar en renglones ya
 * cargados y la cuenta de un mes cerrado no puede quedar sin su nombre.
 */
export async function activarServicio(id: string, activo: boolean) {
  if (!esIdentificador(id)) throw new Error('Ese servicio ya no está en el catálogo.');

  const [cambiado] = await bd
    .update(esquema.servicio)
    .set({ activo })
    .where(eq(esquema.servicio.id, id))
    .returning({ id: esquema.servicio.id, nombre: esquema.servicio.nombre });

  if (!cambiado) throw new Error('Ese servicio ya no está en el catálogo.');
  return cambiado;
}

/* ---------- renglones de una atención ---------- */

export function renglonesDe(atencionId: string) {
  return bd
    .select()
    .from(esquema.renglon)
    .where(eq(esquema.renglon.atencionId, atencionId))
    .orderBy(asc(esquema.renglon.creado));
}

export type RenglonCargado = Awaited<ReturnType<typeof renglonesDe>>[number];

interface Carga {
  atencionId: string;
  cantidad: unknown;
  paga: unknown;
}

function revisarCarga(carga: Carga) {
  const cantidad = cantidadDe(carga.cantidad);
  if (cantidad === null) throw new Error('La cantidad tiene que ser un número mayor que cero.');

  const paga = String(carga.paga ?? '');
  if (!esPagador(paga)) throw new Error('Hay que decir quién paga este renglón.');

  return { cantidad: aColumna(cantidad), paga };
}

/**
 * Carga un servicio del catálogo. Copia nombre y precio al renglón a
 * propósito: lo cargado queda congelado aunque la lista cambie después.
 */
export async function cargarDelCatalogo(carga: Carga & { servicioId: unknown }) {
  const { cantidad, paga } = revisarCarga(carga);

  const servicioId = String(carga.servicioId ?? '');
  if (!servicioId) throw new Error('Hay que elegir un servicio del catálogo.');
  if (!esIdentificador(servicioId)) throw new Error('Ese servicio no está en el catálogo o está desactivado.');

  const [servicio] = await bd
    .select()
    .from(esquema.servicio)
    .where(and(eq(esquema.servicio.id, servicioId), eq(esquema.servicio.activo, true)))
    .limit(1);

  if (!servicio) throw new Error('Ese servicio no está en el catálogo o está desactivado.');

  const [cargado] = await bd
    .insert(esquema.renglon)
    .values({
      atencionId: carga.atencionId,
      servicioId: servicio.id,
      descripcion: servicio.nombre,
      cantidad,
      precio: servicio.precio,
      moneda: servicio.moneda,
      paga,
    })
    .returning();

  return cargado;
}

/** El renglón escrito a mano, para lo que no está en la lista. */
export async function cargarLibre(carga: Carga & { descripcion: unknown; precio: unknown; moneda: unknown }) {
  const { cantidad, paga } = revisarCarga(carga);

  const descripcion = String(carga.descripcion ?? '').trim();
  if (descripcion.length < 3) throw new Error('Falta describir qué se le hizo al paciente.');

  const precio = montoDe(carga.precio);
  if (precio === null) throw new Error('El precio tiene que ser un monto, por ejemplo 35,00.');

  const moneda = String(carga.moneda ?? 'USD');
  if (!esMoneda(moneda)) throw new Error('La moneda tiene que ser USD o VES.');

  const [cargado] = await bd
    .insert(esquema.renglon)
    .values({
      atencionId: carga.atencionId,
      descripcion,
      cantidad,
      precio: aColumna(precio),
      moneda,
      paga,
    })
    .returning();

  return cargado;
}

/**
 * Quita un renglón cargado por error. Es lo único que se borra en el
 * sistema, y se puede porque es un dato de cobro y no un dato clínico;
 * el rastro queda en bitacora. El filtro por atención evita que un id
 * suelto en el formulario toque la cuenta de otro caso.
 */
export async function quitarRenglon(atencionId: string, renglonId: unknown) {
  const id = String(renglonId ?? '');
  if (!id) throw new Error('No se indicó qué renglón quitar.');
  if (!esIdentificador(id)) throw new Error('Ese renglón ya no está cargado.');

  const [quitado] = await bd
    .delete(esquema.renglon)
    .where(and(eq(esquema.renglon.id, id), eq(esquema.renglon.atencionId, atencionId)))
    .returning();

  if (!quitado) throw new Error('Ese renglón ya no está cargado.');
  return quitado;
}
