/**
 * El cierre del mes: qué se hizo y qué hay que cobrar.
 *
 * Vive aparte de la pantalla porque lo usan las dos piezas: la vista del
 * consolidado y el endpoint que baja el Excel.
 *
 * Solo suman las atenciones cerradas. Un borrador todavía no es trabajo
 * terminado y una anulada no se le cobra a nadie; ninguna de las dos se
 * borra, simplemente queda fuera de la cuenta.
 *
 * Cada moneda lleva su propia cuenta, igual que en la cuenta de una
 * atención: el centro cotiza en dólares y cobra en bolívares por taquilla,
 * y sumar las dos daría una cifra que no se le puede pasar a nadie.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { bd, esquema } from './base';
import { hoyEnVenezuela, normalizar } from './atenciones';

/** Un mes tal como lo manda el <input type="month">. */
const FORMA_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Lo que paga el paciente de su bolsillo se cobra todo junto. */
export const PACIENTES_DIRECTOS = 'Pacientes directos';
const SEGURO_SIN_NOMBRE = 'Seguro sin indicar';
const EMPRESA_SIN_NOMBRE = 'Empresa sin indicar';

export function mesActual() {
  return hoyEnVenezuela().slice(0, 7);
}

/** El mes que llegó por la URL, o el mes en curso si no sirve. */
export function mesPedido(texto: string | null | undefined) {
  const pedido = (texto ?? '').trim();
  return FORMA_MES.test(pedido) ? pedido : mesActual();
}

/** Nombre de un pagador → clave de URL y pedazo de nombre de archivo. */
export function clavear(nombre: string) {
  const limpio = normalizar(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return limpio || 'sin-nombre';
}

/** Los montos se cierran a dos decimales en cada paso, no al final. */
const centavos = (monto: number) => Math.round(monto * 100) / 100;

/** Lo que hay que cobrar en una moneda. Nunca se suman dos de estos. */
export interface MontoPorMoneda {
  moneda: string;
  total: number;
}

/** El dólar primero, que es la moneda del catálogo. */
export const ordenarMonedas = (a: string, b: string) =>
  a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b);

/** Suma el monto en la moneda que le toca, y la abre si es la primera. */
function sumarEn(totales: MontoPorMoneda[], moneda: string, monto: number) {
  const ya = totales.find((t) => t.moneda === moneda);
  if (ya) ya.total = centavos(ya.total + monto);
  else totales.push({ moneda, total: centavos(monto) });
}

const montoEn = (totales: readonly MontoPorMoneda[], moneda: string) =>
  totales.find((t) => t.moneda === moneda)?.total ?? 0;

export type QuienPaga = 'paciente' | 'aseguradora' | 'empresa';

/** Un renglón listo para mostrar o exportar: ya trae a quién se le cobra. */
export interface LineaDeCobro {
  atencionId: string;
  numero: number;
  fecha: string;
  paciente: string;
  cedula: string;
  aseguradora: string | null;
  poliza: string | null;
  casoNumero: string | null;
  medico: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  total: number;
  moneda: string;
  paga: QuienPaga;
  /** La aseguradora, la empresa o "Pacientes directos". */
  cobrador: string;
}

export interface CasoDelCierre {
  id: string;
  numero: number;
  fecha: string;
  paciente: string;
  cedula: string;
  aseguradora: string | null;
  poliza: string | null;
  casoNumero: string | null;
  medico: string;
  /** Solo los renglones que le toca pagar a este cobrador. */
  lineas: LineaDeCobro[];
  totales: MontoPorMoneda[];
}

export interface GrupoDeCobro {
  clave: string;
  nombre: string;
  casos: number;
  renglones: number;
  totales: MontoPorMoneda[];
  detalle: CasoDelCierre[];
}

export interface Consolidado {
  mes: string;
  grupos: GrupoDeCobro[];
  /** Atenciones cerradas del mes, hayan dejado algo que cobrar o no. */
  casosCerrados: number;
  /** Cerradas sin un solo renglón cargado: trabajo hecho que nadie facturó. */
  casosSinCobro: number;
  /** Atenciones distintas que sí dejaron algo que cobrar. */
  casosConCobro: number;
  /**
   * Atenciones que se reparten entre dos o más pagadores. Cada una se
   * cuenta en todos sus grupos, así que la columna de casos suma más que
   * las atenciones distintas y hay que decirlo en pantalla.
   */
  casosRepartidos: number;
  renglones: number;
  totales: MontoPorMoneda[];
}

/**
 * El pagador es del renglón, no de la atención. El cliente lo explicó con
 * la bodega: el seguro cubre la consulta, pero el insumo que el médico
 * agregó encima puede quedar a cuenta del paciente.
 */
function cobradorDe(fila: { paga: QuienPaga; aseguradora: string | null; empresa: string | null }) {
  if (fila.paga === 'aseguradora') return fila.aseguradora?.trim() || SEGURO_SIN_NOMBRE;
  if (fila.paga === 'empresa') return fila.empresa?.trim() || EMPRESA_SIN_NOMBRE;
  return PACIENTES_DIRECTOS;
}

/**
 * Consolidado de un mes, agrupado por quién cobra.
 *
 * La columna `periodo` de atencion ya es el primer día del mes —la calcula
 * la base al guardar— así que se compara contra ella en vez de derivar el
 * mes de la fecha en cada consulta: así entra por el índice
 * (periodo, aseguradora).
 */
export async function consolidadoDelMes(mes: string): Promise<Consolidado> {
  const periodo = `${mes}-01`;
  const delMes = and(
    eq(esquema.atencion.estado, 'cerrada'),
    eq(esquema.atencion.periodo, periodo),
  );

  const filas = await bd
    .select({
      atencionId: esquema.atencion.id,
      numero: esquema.atencion.numero,
      fecha: esquema.atencion.fecha,
      aseguradora: esquema.atencion.aseguradora,
      poliza: esquema.atencion.poliza,
      casoNumero: esquema.atencion.casoNumero,
      paciente: esquema.paciente.nombre,
      cedula: esquema.paciente.cedula,
      medico: esquema.user.name,
      descripcion: esquema.renglon.descripcion,
      cantidad: esquema.renglon.cantidad,
      precio: esquema.renglon.precio,
      moneda: esquema.renglon.moneda,
      paga: esquema.renglon.paga,
      // La empresa no tiene columna propia: es un campo de la historia.
      empresa: sql<string | null>`${esquema.atencion.datos} ->> 'empresa'`,
    })
    .from(esquema.renglon)
    .innerJoin(esquema.atencion, eq(esquema.atencion.id, esquema.renglon.atencionId))
    .innerJoin(esquema.paciente, eq(esquema.paciente.id, esquema.atencion.pacienteId))
    .innerJoin(esquema.user, eq(esquema.user.id, esquema.atencion.medicoId))
    .where(delMes)
    .orderBy(asc(esquema.atencion.numero), asc(esquema.renglon.creado));

  const [conteo] = await bd
    .select({ cerradas: sql<number>`count(*)::int` })
    .from(esquema.atencion)
    .where(delMes);

  const grupos = new Map<string, GrupoDeCobro>();
  /* Un caso puede caer en dos grupos a la vez (parte al seguro, parte al
     paciente), así que la llave del detalle lleva el grupo adentro. */
  const casos = new Map<string, CasoDelCierre>();
  /** Atención → los grupos en los que cayó. Una puede caer en varios. */
  const conCobro = new Map<string, Set<string>>();

  for (const fila of filas) {
    const nombre = cobradorDe(fila);
    const clave = clavear(nombre);
    const cantidad = Number(fila.cantidad);
    const precio = Number(fila.precio);
    const total = centavos(cantidad * precio);

    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = { clave, nombre, casos: 0, renglones: 0, totales: [], detalle: [] };
      grupos.set(clave, grupo);
    }

    const llaveCaso = `${clave}|${fila.atencionId}`;
    let caso = casos.get(llaveCaso);
    if (!caso) {
      caso = {
        id: fila.atencionId,
        numero: fila.numero,
        fecha: fila.fecha,
        paciente: fila.paciente,
        cedula: fila.cedula,
        aseguradora: fila.aseguradora,
        poliza: fila.poliza,
        casoNumero: fila.casoNumero,
        medico: fila.medico,
        lineas: [],
        totales: [],
      };
      casos.set(llaveCaso, caso);
      grupo.detalle.push(caso);
      grupo.casos += 1;
    }

    caso.lineas.push({
      atencionId: fila.atencionId,
      numero: fila.numero,
      fecha: fila.fecha,
      paciente: fila.paciente,
      cedula: fila.cedula,
      aseguradora: fila.aseguradora,
      poliza: fila.poliza,
      casoNumero: fila.casoNumero,
      medico: fila.medico,
      descripcion: fila.descripcion,
      cantidad,
      precio,
      total,
      moneda: fila.moneda,
      paga: fila.paga,
      cobrador: nombre,
    });
    sumarEn(caso.totales, fila.moneda, total);
    grupo.renglones += 1;
    sumarEn(grupo.totales, fila.moneda, total);
    const grupoDe = conCobro.get(fila.atencionId) ?? new Set<string>();
    grupoDe.add(clave);
    conCobro.set(fila.atencionId, grupoDe);
  }

  /* Primero lo más grande: es el orden en que administración va a cobrar.
     Se mide en dólares, que es la moneda del catálogo; un pagador que solo
     debe bolívares se ordena entre los suyos por su propio monto. Ni para
     ordenar se suman dos monedas. */
  const mayorEnOtra = (g: GrupoDeCobro) =>
    Math.max(0, ...g.totales.filter((t) => t.moneda !== 'USD').map((t) => t.total));

  const lista = [...grupos.values()];
  for (const grupo of lista) {
    grupo.totales.sort((a, b) => ordenarMonedas(a.moneda, b.moneda));
    for (const caso of grupo.detalle) caso.totales.sort((a, b) => ordenarMonedas(a.moneda, b.moneda));
  }
  lista.sort(
    (a, b) =>
      montoEn(b.totales, 'USD') - montoEn(a.totales, 'USD') ||
      mayorEnOtra(b) - mayorEnOtra(a) ||
      a.nombre.localeCompare(b.nombre, 'es'),
  );

  const cerradas = Number(conteo?.cerradas ?? 0);

  const totales: MontoPorMoneda[] = [];
  for (const grupo of lista) for (const t of grupo.totales) sumarEn(totales, t.moneda, t.total);
  totales.sort((a, b) => ordenarMonedas(a.moneda, b.moneda));

  return {
    mes,
    grupos: lista,
    casosCerrados: cerradas,
    casosSinCobro: Math.max(0, cerradas - conCobro.size),
    casosConCobro: conCobro.size,
    casosRepartidos: [...conCobro.values()].filter((g) => g.size > 1).length,
    renglones: filas.length,
    totales,
  };
}

/** Las líneas que van al Excel: las de un cobrador, o todas. */
export function lineasDe(consolidado: Consolidado, cobrarA?: string | null) {
  const grupos = cobrarA
    ? consolidado.grupos.filter((g) => g.clave === cobrarA)
    : consolidado.grupos;
  return grupos.flatMap((g) => g.detalle.flatMap((caso) => caso.lineas));
}

/* =====================================================================
   Formatos de exportación
   ===================================================================== */

export type TipoColumna = 'texto' | 'fecha' | 'numero' | 'dinero' | 'moneda';

export interface ColumnaExcel {
  rotulo: string;
  /** Ancho en caracteres, como lo mide Excel. */
  ancho: number;
  /**
   * Por omisión 'texto'. 'dinero' y 'numero' entran como número, no como
   * texto. 'moneda' marca la columna que dice en qué se cobra: la planilla
   * cierra una fila de totales por cada una.
   */
  tipo?: TipoColumna;
  /** Se suma en la fila de totales, dentro de su propia moneda. */
  sumar?: boolean;
  valor: (linea: LineaDeCobro) => string | number | null;
}

export interface FormatoExcel {
  /** Lo que viaja en la URL: ...&formato=<clave> */
  clave: string;
  nombre: string;
  columnas: readonly ColumnaExcel[];
}

/** El formato del centro: una fila por renglón y todo lo que hace falta. */
const propio: FormatoExcel = {
  clave: 'atenmefa',
  nombre: 'Planilla de Atenmefa',
  columnas: [
    { rotulo: 'N° atención', ancho: 12, tipo: 'numero', valor: (l) => l.numero },
    { rotulo: 'Fecha', ancho: 12, tipo: 'fecha', valor: (l) => l.fecha },
    { rotulo: 'Paciente', ancho: 32, valor: (l) => l.paciente },
    { rotulo: 'Cédula', ancho: 14, valor: (l) => l.cedula },
    { rotulo: 'Seguro', ancho: 24, valor: (l) => l.aseguradora },
    { rotulo: 'Médico', ancho: 26, valor: (l) => l.medico },
    { rotulo: 'Concepto', ancho: 42, valor: (l) => l.descripcion },
    { rotulo: 'Cantidad', ancho: 10, tipo: 'numero', sumar: true, valor: (l) => l.cantidad },
    { rotulo: 'Precio', ancho: 14, tipo: 'dinero', valor: (l) => l.precio },
    // Sin esta columna el precio y el total no se pueden leer: el centro
    // cotiza en dólares y cobra por taquilla en bolívares.
    { rotulo: 'Moneda', ancho: 10, tipo: 'moneda', valor: (l) => l.moneda },
    { rotulo: 'Total', ancho: 14, tipo: 'dinero', sumar: true, valor: (l) => l.total },
    { rotulo: 'Lo paga', ancho: 26, valor: (l) => l.cobrador },
  ],
};

/* ---------------------------------------------------------------------
   AQUÍ SE AGREGA EL FORMATO DE UNA ASEGURADORA.
   ---------------------------------------------------------------------
   Cada aseguradora manda su propia planilla y todavía no tenemos ninguna:
   el cliente no las ha entregado. Por eso abajo solo está la nuestra; no
   hay columnas adivinadas.

   Cuando llegue la planilla de, por ejemplo, Seguros Miranda:

     1. Copie el objeto `propio` acá abajo con otro nombre de constante.
     2. Cámbiele `clave` (sin acentos ni espacios: 'seguros-miranda'),
        `nombre`, y la lista de `columnas` con los rótulos, el orden y los
        anchos exactos de su planilla. `valor` saca el dato de la línea; si
        la aseguradora pide algo que no está en LineaDeCobro, se agrega
        primero al SELECT de consolidadoDelMes. Deje la columna de
        `tipo: 'moneda'`: de ella salen las filas de totales, una por
        moneda, y sin ella la planilla sumaría dólares con bolívares.
     3. Agregue la constante a la lista `formatos`.
     4. Se baja con /sistema/cierre/exportar?mes=2026-11&formato=seguros-miranda
        (y &cobrar_a=seguros-miranda para que lleve solo lo de ese seguro).

   No hace falta tocar el endpoint: él recorre las columnas que encuentre.
   --------------------------------------------------------------------- */
export const formatos: readonly FormatoExcel[] = [propio];

export function formatoPara(clave: string | null | undefined): FormatoExcel {
  return formatos.find((f) => f.clave === clave) ?? propio;
}
