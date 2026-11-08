/**
 * El laboratorio: la orden, lo que se le va a hacer y lo que dio.
 *
 * Vive aparte del cobro aunque use sus renglones, porque la pregunta que
 * contesta es otra. En cobro la pregunta es cuánto se le cobra; acá es qué
 * exámenes tiene pedidos esta persona. Son la misma fila de la base vista
 * desde dos lados, y el cliente lo pidió así: «poder ir seleccionando todo
 * lo que se va a hacer y que les genere el precio en bolívar y en dólares,
 * automáticamente, y esa persona se encarga de cobrar».
 *
 * De ahí la decisión que manda sobre este archivo: marcar un examen en el
 * formulario ES cargarlo a la cuenta. No hay dos listas que mantener
 * iguales —la de lo que se le hace y la de lo que se le cobra— porque dos
 * listas se separan el primer día que alguien corrige una sola.
 */
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { bd, esquema } from './base';
import { pagadorSugerido } from './cobro';
import { normalizar } from './atenciones';
import type { Resultado } from '../laboratorio';

/** La categoría del catálogo de precios donde viven los exámenes. */
export const CATEGORIA = 'laboratorio';

/** Los exámenes que el centro cobra, con su precio. */
export function catalogoDeExamenes() {
  return bd
    .select({
      id: esquema.servicio.id,
      nombre: esquema.servicio.nombre,
      precio: esquema.servicio.precio,
      moneda: esquema.servicio.moneda,
    })
    .from(esquema.servicio)
    .where(and(
      eq(esquema.servicio.categoria, CATEGORIA),
      eq(esquema.servicio.activo, true),
    ))
    .orderBy(asc(esquema.servicio.nombre));
}

export type ExamenDelCatalogo = Awaited<ReturnType<typeof catalogoDeExamenes>>[number];

/**
 * Los exámenes ya pedidos en esta orden: los renglones que salieron del
 * catálogo de laboratorio.
 *
 * Se filtra por la categoría del servicio y no por la atención completa,
 * porque a una orden de laboratorio se le puede haber cargado otra cosa a
 * mano —el material de la toma, por ejemplo— y eso no es un examen.
 */
export async function examenesPedidos(atencionId: string) {
  const filas = await bd
    .select({
      renglonId: esquema.renglon.id,
      servicioId: esquema.renglon.servicioId,
      nombre: esquema.renglon.descripcion,
    })
    .from(esquema.renglon)
    .innerJoin(esquema.servicio, eq(esquema.servicio.id, esquema.renglon.servicioId))
    .where(and(
      eq(esquema.renglon.atencionId, atencionId),
      eq(esquema.servicio.categoria, CATEGORIA),
    ))
    .orderBy(asc(esquema.renglon.creado));

  return filas;
}

/**
 * Deja la cuenta diciendo exactamente lo que quedó marcado en el
 * formulario: carga los exámenes nuevos y quita los que se destildaron.
 *
 * Es idempotente a propósito. El formulario se guarda solo mientras
 * recepción escribe, y cada guardado manda la lista completa: si esto
 * insertara sin comparar, una orden de tres exámenes terminaría con quince
 * renglones y la cuenta cobrada cinco veces.
 */
export async function sincronizarExamenes(
  atencionId: string,
  marcados: readonly string[],
  aseguradora?: string | null,
): Promise<{ agregados: number; quitados: number }> {
  const quiere = new Set(marcados.filter(Boolean));
  const ya = await examenesPedidos(atencionId);
  const tiene = new Set(ya.map((r) => r.servicioId!).filter(Boolean));

  const sobran = ya.filter((r) => !quiere.has(r.servicioId!));
  if (sobran.length) {
    await bd.delete(esquema.renglon).where(and(
      eq(esquema.renglon.atencionId, atencionId),
      inArray(esquema.renglon.id, sobran.map((r) => r.renglonId)),
    ));
  }

  const faltan = [...quiere].filter((id) => !tiene.has(id));
  if (faltan.length) {
    /* El precio se copia al renglón, igual que en cobro: lo pedido queda
       congelado aunque mañana suba la lista. */
    const servicios = await bd
      .select()
      .from(esquema.servicio)
      .where(and(
        inArray(esquema.servicio.id, faltan),
        eq(esquema.servicio.categoria, CATEGORIA),
        eq(esquema.servicio.activo, true),
      ));

    if (servicios.length) {
      await bd.insert(esquema.renglon).values(
        servicios.map((s) => ({
          atencionId,
          servicioId: s.id,
          descripcion: s.nombre,
          cantidad: '1.00',
          precio: s.precio,
          moneda: s.moneda,
          paga: pagadorSugerido(aseguradora),
        })),
      );
    }
  }

  return { agregados: faltan.length, quitados: sobran.length };
}

/**
 * Las plantillas de examen que mandó el cliente.
 *
 * Elegir una pone sus renglones con el analito y la unidad ya escritos, que
 * es la mayor parte del trabajo de cargar un resultado. Lo que NO hace es
 * cerrar nada: el valor de referencia cae en un campo editable al lado del
 * valor que se está tecleando, y hay 92 analitos que vienen sin rango
 * porque su hoja no lo decía en una columna rotulada. Ver
 * 013-plantillas.sql, que explica por qué no se dedujo.
 */
export async function plantillasDeExamen() {
  const filas = await bd
    .select({
      examen: esquema.plantillaExamen.examen,
      analito: esquema.plantillaExamen.analito,
      unidad: esquema.plantillaExamen.unidad,
      referencia: esquema.plantillaExamen.referencia,
    })
    .from(esquema.plantillaExamen)
    .orderBy(asc(esquema.plantillaExamen.examen), asc(esquema.plantillaExamen.orden));

  const porExamen = new Map<string, { analito: string; unidad: string; referencia: string }[]>();
  for (const f of filas) {
    const lista = porExamen.get(f.examen) ?? [];
    lista.push({ analito: f.analito, unidad: f.unidad, referencia: f.referencia });
    porExamen.set(f.examen, lista);
  }

  return [...porExamen.entries()].map(([examen, analitos]) => ({ examen, analitos }));
}

/**
 * Los nombres de examen que trae el archivo del laboratorio.
 *
 * Es la lista real de lo que el centro hace, en las palabras del propio
 * cliente: salen de las hojas de su Excel. Sirve para dos cosas distintas y
 * conviene no confundirlas: la plantilla dice qué analitos tiene cada
 * examen, y esto dice qué exámenes existen.
 */
export async function examenesDelArchivo(): Promise<string[]> {
  const filas = await bd
    .selectDistinct({ examen: esquema.plantillaExamen.examen })
    .from(esquema.plantillaExamen)
    .orderBy(asc(esquema.plantillaExamen.examen));
  return filas.map((f) => f.examen);
}

/**
 * Carga al catálogo de precios los exámenes del archivo que falten.
 *
 * El selector de exámenes sale del catálogo, y el catálogo arranca vacío:
 * la pantalla de la orden decía «el catálogo de exámenes está vacío» y no
 * había forma razonable de llenarlo salvo teclear treinta y cinco nombres a
 * mano. Esto los pone de un golpe.
 *
 * LOS DEJA EN CERO, Y ESO NO ES UN DESCUIDO
 *
 * No tenemos sus precios, y un precio inventado en un catálogo termina
 * cobrado. Entran en 0 y la pantalla los muestra como «sin precio» —no como
 * «0,00»— y no los suma al total: recepción puede registrar hoy qué se le
 * hace al paciente, y la cuenta dice en la cara cuántos exámenes todavía no
 * tienen precio.
 *
 * No toca los que ya están: se compara por nombre normalizado, así que
 * correrlo dos veces no duplica nada ni pisa un precio ya puesto.
 */
export async function cargarExamenesAlCatalogo(): Promise<{ agregados: string[] }> {
  const delArchivo = await examenesDelArchivo();

  const yaEstan = await bd
    .select({ nombre: esquema.servicio.nombre })
    .from(esquema.servicio);
  const conocidos = new Set(yaEstan.map((s) => normalizar(s.nombre)));

  const faltan = delArchivo.filter((e) => !conocidos.has(normalizar(e)));
  if (faltan.length === 0) return { agregados: [] };

  await bd.insert(esquema.servicio).values(
    faltan.map((nombre) => ({
      nombre,
      categoria: CATEGORIA,
      precio: '0.00',
      moneda: 'USD',
      activo: true,
    })),
  );

  return { agregados: faltan };
}

/** Lo que se le pidió, como se lee en el informe. Uno por línea. */
export const textoDeExamenes = (nombres: readonly string[]) => nombres.join('\n');

/* ------------------------------------------------------------------
   Resultados.
   ------------------------------------------------------------------ */

/**
 * Lee la tabla de resultados que mandó el bioanalista.
 *
 * Los tres campos de cada examen viajan en arreglos paralelos
 * (valor[], unidad[], referencia[]) alineados con examen[]. Un examen sin
 * valor se guarda igual: en una orden de cinco se cargan tres hoy y dos
 * cuando salga la segunda corrida, y perder las filas vacías obligaría a
 * volver a escribir los nombres.
 *
 * Solo se descarta la línea COMPLETAMENTE vacía. Una con un valor escrito y
 * sin nombre no se tira en silencio —sería borrarle una medición a quien la
 * acaba de teclear—: vuelve a la pantalla y la pantalla pide ponerle nombre
 * antes de entregar.
 */
export function leerResultados(form: FormData): Resultado[] {
  const examenes = form.getAll('examen').map((v) => String(v).trim());
  const valores = form.getAll('valor').map((v) => String(v).trim());
  const unidades = form.getAll('unidad').map((v) => String(v).trim());
  const referencias = form.getAll('referencia').map((v) => String(v).trim());

  return examenes
    .map((examen, i) => ({
      examen,
      valor: valores[i] ?? '',
      unidad: unidades[i] ?? '',
      referencia: referencias[i] ?? '',
    }))
    .filter((r) => r.examen || r.valor || r.unidad || r.referencia);
}

/** Líneas con un resultado escrito y sin decir de qué examen es. */
export const sinNombre = (resultados: readonly Resultado[]) =>
  resultados.filter((r) => !r.examen && (r.valor || r.unidad || r.referencia)).length;

/** Cuántos de los exámenes pedidos ya tienen un valor escrito. */
export const cuantosResueltos = (resultados: readonly Resultado[]) =>
  resultados.filter((r) => r.valor).length;

/**
 * Guarda los resultados y, si se piden por listos, cierra la orden.
 *
 * Quien firma queda en resultados_por y no en medico_id: medico_id es quien
 * registró la orden, que casi siempre es recepción. En un informe de
 * laboratorio la firma que vale es la del bioanalista, con su colegio.
 */
export async function guardarResultados(
  atencionId: string,
  resultados: readonly Resultado[],
  bioanalistaId: string,
  entregar: boolean,
) {
  const [antes] = await bd
    .select({ estado: esquema.atencion.estado, tipo: esquema.atencion.tipo })
    .from(esquema.atencion)
    .where(eq(esquema.atencion.id, atencionId))
    .limit(1);

  if (!antes || antes.tipo !== 'laboratorio' || antes.estado !== 'borrador') return null;

  const [guardada] = await bd
    .update(esquema.atencion)
    .set({
      resultados: [...resultados],
      resultadosPor: bioanalistaId,
      resultadosEn: new Date(),
      ...(entregar ? { estado: 'cerrada' as const, cerrada: new Date() } : {}),
    })
    .where(and(
      eq(esquema.atencion.id, atencionId),
      eq(esquema.atencion.estado, 'borrador'),
    ))
    .returning({ id: esquema.atencion.id, numero: esquema.atencion.numero });

  return guardada ?? null;
}

/* ------------------------------------------------------------------
   La cola.
   ------------------------------------------------------------------ */

export type EstadoEnCola = 'sin-resultados' | 'a-medias' | 'entregada';

/**
 * Lo que el laboratorio tiene entre manos.
 *
 * Pendientes primero y lo más viejo arriba: una muestra que lleva dos días
 * sin resultado es más urgente que la de esta mañana, y en una lista
 * ordenada por fecha descendente esa es justo la que se pierde de vista.
 */
export async function colaDelLaboratorio(opciones: { entregadas?: boolean } = {}) {
  const filas = await bd
    .select({
      id: esquema.atencion.id,
      numero: esquema.atencion.numero,
      fecha: esquema.atencion.fecha,
      estado: esquema.atencion.estado,
      resultados: esquema.atencion.resultados,
      origenId: esquema.atencion.origenId,
      /* Para saber quién puede borrar la orden abierta. */
      medicoId: esquema.atencion.medicoId,
      aseguradora: esquema.atencion.aseguradora,
      paciente: esquema.paciente.nombre,
      cedula: esquema.paciente.cedula,
      /* Para el botón de WhatsApp de la cola: recepción avisa desde acá, sin
         tener que entrar a la orden. */
      telefono: esquema.paciente.telefono,
      whatsapp: esquema.paciente.whatsapp,
      registro: esquema.atencion.datos,
      examenes: sql<number>`(
        SELECT COUNT(*) FROM renglon r
          JOIN servicio s ON s.id = r.servicio_id
         WHERE r.atencion_id = ${esquema.atencion.id} AND s.categoria = ${CATEGORIA}
      )`,
    })
    .from(esquema.atencion)
    .innerJoin(esquema.paciente, eq(esquema.paciente.id, esquema.atencion.pacienteId))
    .where(and(
      eq(esquema.atencion.tipo, 'laboratorio'),
      opciones.entregadas
        ? eq(esquema.atencion.estado, 'cerrada')
        : eq(esquema.atencion.estado, 'borrador'),
    ))
    .orderBy(
      opciones.entregadas ? desc(esquema.atencion.fecha) : asc(esquema.atencion.fecha),
      opciones.entregadas ? desc(esquema.atencion.numero) : asc(esquema.atencion.numero),
    )
    .limit(100);

  return filas.map((f) => {
    const resueltos = cuantosResueltos(f.resultados ?? []);
    const estado: EstadoEnCola =
      f.estado === 'cerrada' ? 'entregada' : resueltos > 0 ? 'a-medias' : 'sin-resultados';
    return { ...f, resueltos, enCola: estado };
  });
}

/** Cuántas órdenes esperan resultados. Para el aviso del menú. */
export async function cuantasPendientes() {
  const [fila] = await bd
    .select({ n: sql<number>`COUNT(*)` })
    .from(esquema.atencion)
    .where(and(
      eq(esquema.atencion.tipo, 'laboratorio'),
      eq(esquema.atencion.estado, 'borrador'),
    ));
  return Number(fila?.n ?? 0);
}

/* ------------------------------------------------------------------
   El hilo con la consulta.
   ------------------------------------------------------------------ */

/**
 * Las órdenes de laboratorio que salieron de una consulta.
 *
 * Es la respuesta a lo que el cliente dejó abierto: «ese paciente al que el
 * médico le había solicitado un examen, ¿se queda aparte o se anexa a la
 * historia médica?». Se anexa. El médico ve el resultado donde escribió la
 * indicación, y el que vino solo al laboratorio —sin origen— no le aparece
 * nunca entre sus casos.
 */
export function ordenesDe(consultaId: string) {
  return bd
    .select({
      id: esquema.atencion.id,
      numero: esquema.atencion.numero,
      fecha: esquema.atencion.fecha,
      estado: esquema.atencion.estado,
      resultados: esquema.atencion.resultados,
      resultadosEn: esquema.atencion.resultadosEn,
    })
    .from(esquema.atencion)
    .where(eq(esquema.atencion.origenId, consultaId))
    .orderBy(asc(esquema.atencion.numero));
}

/** Órdenes de laboratorio de un paciente, para su ficha. */
export function ordenesDelPaciente(pacienteId: string) {
  return bd
    .select({
      id: esquema.atencion.id,
      numero: esquema.atencion.numero,
      fecha: esquema.atencion.fecha,
      estado: esquema.atencion.estado,
      resultados: esquema.atencion.resultados,
      origenId: esquema.atencion.origenId,
    })
    .from(esquema.atencion)
    .where(and(
      eq(esquema.atencion.pacienteId, pacienteId),
      eq(esquema.atencion.tipo, 'laboratorio'),
    ))
    .orderBy(desc(esquema.atencion.fecha), desc(esquema.atencion.numero));
}
