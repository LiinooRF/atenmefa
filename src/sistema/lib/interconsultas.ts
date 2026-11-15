/**
 * Interconsultas: lo que el médico deriva a un especialista.
 *
 * El médico elige la especialidad y dice para qué. Administración ve la
 * lista de lo pendiente con los especialistas de esa área, su precio y su
 * WhatsApp, y les escribe con un toque. Ver 026-interconsultas.sql.
 *
 * Las reglas viven acá y no en las pantallas: el formulario se puede armar
 * a mano.
 */
import { alias } from 'drizzle-orm/pg-core';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { bd, esquema } from './base';
import { anotar, esIdentificador, normalizar } from './atenciones';
import { montoDe } from './cobro';
import { puede } from './permisos';
import { enlaceDeWhatsApp, paraWhatsApp } from './telefono';
import { marca } from '../../data/marca';
import type { Usuario } from './auth';

export type EstadoInterconsulta = 'pendiente' | 'contactada' | 'atendida' | 'anulada';

export const ROTULO_ESTADO: Record<EstadoInterconsulta, string> = {
  pendiente: 'Pendiente',
  contactada: 'Especialista contactado',
  atendida: 'Atendida',
  anulada: 'Anulada',
};

const corto = (t: unknown, largo: number) => String(t ?? '').trim().slice(0, largo);

/* ------------------------------------------------------------------
   Los especialistas.
   ------------------------------------------------------------------ */

/** Las especialidades que hay, una vez cada una, para el selector del médico. */
export async function especialidades(): Promise<string[]> {
  const filas = await bd
    .select({ especialidad: esquema.especialista.especialidad, busca: esquema.especialista.especialidadBusca })
    .from(esquema.especialista)
    .where(eq(esquema.especialista.activo, true))
    .orderBy(asc(esquema.especialista.especialidadBusca), asc(esquema.especialista.creado));
  const unicas = new Map<string, string>();
  for (const f of filas) if (!unicas.has(f.busca)) unicas.set(f.busca, f.especialidad);
  return [...unicas.values()];
}

export async function listarEspecialistas() {
  return bd
    .select()
    .from(esquema.especialista)
    .orderBy(asc(esquema.especialista.especialidadBusca), asc(esquema.especialista.nombre));
}

export async function especialistaPorId(id: string) {
  if (!esIdentificador(id)) return null;
  const [e] = await bd.select().from(esquema.especialista).where(eq(esquema.especialista.id, id)).limit(1);
  return e ?? null;
}

export interface DatosEspecialista {
  especialidad: unknown; nombre: unknown; whatsapp: unknown; precio: unknown; notas: unknown;
}

/** Crea o corrige un especialista. Lanza con el motivo. */
export async function guardarEspecialista(usuario: Usuario, id: string | null, datos: DatosEspecialista) {
  if (!puede(usuario.rol as string, 'editar_catalogo')) {
    throw new Error('Los especialistas los carga administración.');
  }
  const especialidad = corto(datos.especialidad, 120);
  const nombre = corto(datos.nombre, 160);
  if (!especialidad) throw new Error('Falta la especialidad.');
  if (!nombre) throw new Error('Falta el nombre del especialista.');

  /* Un número que no es número no se guarda como si lo fuera: el botón
     de WhatsApp abriría un chat con nadie. Vacío sí se puede, y la
     pantalla avisa que a ese no se le puede escribir desde acá. */
  const crudoWa = corto(datos.whatsapp, 40);
  const whatsapp = crudoWa ? paraWhatsApp(crudoWa) : null;
  if (crudoWa && !whatsapp) throw new Error('Ese número de WhatsApp no se entiende. Ejemplo: 0414-1234567.');

  const crudoPrecio = corto(datos.precio, 30);
  const precio = crudoPrecio ? montoDe(crudoPrecio) : null;
  if (crudoPrecio && (precio === null || precio < 0)) throw new Error('El precio no se entiende. Ejemplo: 40,00.');

  const valores = {
    especialidad,
    especialidadBusca: normalizar(especialidad),
    nombre,
    whatsapp,
    precio: precio === null ? null : precio.toFixed(2),
    notas: corto(datos.notas, 500) || null,
  };

  if (id) {
    if (!esIdentificador(id)) throw new Error('Ese especialista ya no está.');
    const [hecho] = await bd.update(esquema.especialista).set(valores)
      .where(eq(esquema.especialista.id, id)).returning({ id: esquema.especialista.id });
    if (!hecho) throw new Error('Ese especialista ya no está.');
    await anotar(usuario.id, 'especialista', undefined, { accion: 'edito', nombre, especialidad });
    return hecho.id;
  }
  const [nuevo] = await bd.insert(esquema.especialista).values(valores).returning({ id: esquema.especialista.id });
  await anotar(usuario.id, 'especialista', undefined, { accion: 'creo', nombre, especialidad });
  return nuevo.id;
}

/** Apaga o prende. No se borra: las interconsultas viejas lo nombran. */
export async function activarEspecialista(usuario: Usuario, id: string, activo: boolean) {
  if (!puede(usuario.rol as string, 'editar_catalogo')) throw new Error('Los especialistas los carga administración.');
  if (!esIdentificador(id)) throw new Error('Ese especialista ya no está.');
  await bd.update(esquema.especialista).set({ activo }).where(eq(esquema.especialista.id, id));
  await anotar(usuario.id, 'especialista', undefined, { accion: activo ? 'prendio' : 'apago', id });
}

/* ------------------------------------------------------------------
   Las interconsultas.
   ------------------------------------------------------------------ */

/** El médico la pide desde la consulta. Lanza con el motivo. */
export async function pedirInterconsulta(
  usuario: Usuario, atencionId: string, entrada: { especialidad: unknown; motivo: unknown },
) {
  if (!puede(usuario.rol as string, 'pedir_interconsulta')) {
    throw new Error('Las interconsultas las pide el médico.');
  }
  const [caso] = await bd
    .select({ tipo: esquema.atencion.tipo, estado: esquema.atencion.estado })
    .from(esquema.atencion).where(eq(esquema.atencion.id, atencionId)).limit(1);
  if (!caso) throw new Error('Esa atención no existe.');
  if (caso.tipo !== 'general') throw new Error('Las interconsultas salen de una consulta, no de una orden de laboratorio.');
  if (caso.estado === 'anulada') throw new Error('Esta atención está anulada.');

  const especialidad = corto(entrada.especialidad, 120);
  if (!especialidad) throw new Error('Elija la especialidad.');
  const motivo = String(entrada.motivo ?? '').replace(/\r\n?/g, '\n').trim();
  if (motivo.length > 2000) throw new Error('El motivo es demasiado largo: hasta 2000 caracteres.');
  const busca = normalizar(especialidad);

  /* La misma especialidad dos veces en la misma consulta es casi siempre
     un doble clic, y le haría escribir dos veces al mismo especialista. */
  const [ya] = await bd
    .select({ id: esquema.interconsulta.id })
    .from(esquema.interconsulta)
    .where(and(
      eq(esquema.interconsulta.atencionId, atencionId),
      eq(esquema.interconsulta.especialidadBusca, busca),
      inArray(esquema.interconsulta.estado, ['pendiente', 'contactada']),
    ))
    .limit(1);
  if (ya) throw new Error(`Ya hay una interconsulta de ${especialidad} abierta para esta consulta.`);

  const [nueva] = await bd.insert(esquema.interconsulta).values({
    atencionId, especialidad, especialidadBusca: busca, motivo, pedidaPor: usuario.id,
  }).returning({ id: esquema.interconsulta.id });
  await anotar(usuario.id, 'pidio_interconsulta', atencionId, { especialidad, interconsulta: nueva.id });
  return nueva.id;
}

/** Las de una consulta, para su ficha. */
export async function interconsultasDe(atencionId: string) {
  const medico = alias(esquema.user, 'medico');
  return bd
    .select({
      id: esquema.interconsulta.id,
      especialidad: esquema.interconsulta.especialidad,
      motivo: esquema.interconsulta.motivo,
      estado: esquema.interconsulta.estado,
      pedida: esquema.interconsulta.pedida,
      contactada: esquema.interconsulta.contactada,
      medico: medico.name,
      especialista: esquema.especialista.nombre,
      anuladaMotivo: esquema.interconsulta.anuladaMotivo,
    })
    .from(esquema.interconsulta)
    .innerJoin(medico, eq(medico.id, esquema.interconsulta.pedidaPor))
    .leftJoin(esquema.especialista, eq(esquema.especialista.id, esquema.interconsulta.especialistaId))
    .where(eq(esquema.interconsulta.atencionId, atencionId))
    .orderBy(asc(esquema.interconsulta.pedida));
}

/** Lo que administración tiene que resolver: pendientes primero, lo más viejo arriba. */
export async function interconsultasAbiertas() {
  const medico = alias(esquema.user, 'medico');
  const filas = await bd
    .select({
      id: esquema.interconsulta.id,
      especialidad: esquema.interconsulta.especialidad,
      especialidadBusca: esquema.interconsulta.especialidadBusca,
      motivo: esquema.interconsulta.motivo,
      estado: esquema.interconsulta.estado,
      pedida: esquema.interconsulta.pedida,
      contactada: esquema.interconsulta.contactada,
      atencionId: esquema.interconsulta.atencionId,
      numero: esquema.atencion.numero,
      paciente: esquema.paciente.nombre,
      cedula: esquema.paciente.cedula,
      medico: medico.name,
      especialista: esquema.especialista.nombre,
    })
    .from(esquema.interconsulta)
    .innerJoin(esquema.atencion, eq(esquema.atencion.id, esquema.interconsulta.atencionId))
    .innerJoin(esquema.paciente, eq(esquema.paciente.id, esquema.atencion.pacienteId))
    .innerJoin(medico, eq(medico.id, esquema.interconsulta.pedidaPor))
    .leftJoin(esquema.especialista, eq(esquema.especialista.id, esquema.interconsulta.especialistaId))
    .where(inArray(esquema.interconsulta.estado, ['pendiente', 'contactada']))
    .orderBy(desc(esquema.interconsulta.estado), asc(esquema.interconsulta.pedida));
  return filas;
}

/** Cuántas esperan que alguien las contacte. Para el menú. */
export async function cuantasPendientes(): Promise<number> {
  const filas = await bd.select({ id: esquema.interconsulta.id }).from(esquema.interconsulta)
    .where(eq(esquema.interconsulta.estado, 'pendiente'));
  return filas.length;
}

/** El mensaje que se le manda al especialista. Sin datos del paciente: va por WhatsApp. */
export const mensajeAlEspecialista = (especialidad: string) =>
  `Buenas, le escribimos de ${marca.nombre}. Tenemos un paciente con una ` +
  `interconsulta de ${especialidad} pendiente aquí en el centro. ` +
  `¿Cuándo podría atenderlo? Lo esperamos.`;

/**
 * Deja anotado a quién se le escribió y devuelve el enlace de WhatsApp.
 * Se anota ANTES de abrir el chat: si se anotara después, cerrar la
 * pestaña de WhatsApp dejaría la interconsulta como si nadie hubiera
 * escrito.
 */
export async function contactar(usuario: Usuario, interconsultaId: string, especialistaId: string) {
  if (!puede(usuario.rol as string, 'gestionar_interconsultas')) {
    throw new Error('Las interconsultas las lleva administración.');
  }
  if (!esIdentificador(interconsultaId) || !esIdentificador(especialistaId)) {
    throw new Error('Esa interconsulta ya no está.');
  }
  const [ic] = await bd.select({
    estado: esquema.interconsulta.estado,
    busca: esquema.interconsulta.especialidadBusca,
    especialidad: esquema.interconsulta.especialidad,
    atencionId: esquema.interconsulta.atencionId,
  }).from(esquema.interconsulta).where(eq(esquema.interconsulta.id, interconsultaId)).limit(1);
  if (!ic || !['pendiente', 'contactada'].includes(ic.estado)) {
    throw new Error('Esa interconsulta ya no está abierta.');
  }
  const esp = await especialistaPorId(especialistaId);
  if (!esp || !esp.activo) throw new Error('Ese especialista no está disponible.');
  if (!esp.whatsapp) throw new Error(`${esp.nombre} no tiene WhatsApp cargado.`);
  /* El especialista tiene que ser del área que se pidió: un toque en la
     fila equivocada no le escribe a un traumatólogo por un riñón. */
  if (esp.especialidadBusca !== ic.busca) throw new Error(`${esp.nombre} no es de ${ic.especialidad}.`);

  await bd.update(esquema.interconsulta).set({
    estado: 'contactada', especialistaId: esp.id, contactadaPor: usuario.id, contactada: new Date(),
  }).where(eq(esquema.interconsulta.id, interconsultaId));
  await anotar(usuario.id, 'contacto_especialista', ic.atencionId, {
    interconsulta: interconsultaId, especialista: esp.nombre,
  });
  return enlaceDeWhatsApp(esp.whatsapp, mensajeAlEspecialista(ic.especialidad));
}

/** El especialista ya lo vio. */
export async function marcarAtendida(usuario: Usuario, interconsultaId: string) {
  if (!puede(usuario.rol as string, 'gestionar_interconsultas')) throw new Error('Las interconsultas las lleva administración.');
  if (!esIdentificador(interconsultaId)) throw new Error('Esa interconsulta ya no está.');
  const hecho = await bd.update(esquema.interconsulta)
    .set({ estado: 'atendida', atendida: new Date() })
    .where(and(eq(esquema.interconsulta.id, interconsultaId), eq(esquema.interconsulta.estado, 'contactada')))
    .returning({ atencionId: esquema.interconsulta.atencionId });
  if (!hecho.length) throw new Error('Primero hay que contactar al especialista.');
  await anotar(usuario.id, 'interconsulta_atendida', hecho[0].atencionId, { interconsulta: interconsultaId });
}

/** Se anula con motivo, no se borra. */
export async function anularInterconsulta(usuario: Usuario, interconsultaId: string, motivo: unknown) {
  if (!puede(usuario.rol as string, 'gestionar_interconsultas')) throw new Error('Las interconsultas las lleva administración.');
  if (!esIdentificador(interconsultaId)) throw new Error('Esa interconsulta ya no está.');
  const razon = corto(motivo, 1000);
  if (!razon) throw new Error('Escriba por qué se anula.');
  const hecho = await bd.update(esquema.interconsulta)
    .set({ estado: 'anulada', anuladaPor: usuario.id, anuladaMotivo: razon })
    .where(and(
      eq(esquema.interconsulta.id, interconsultaId),
      inArray(esquema.interconsulta.estado, ['pendiente', 'contactada']),
    ))
    .returning({ atencionId: esquema.interconsulta.atencionId });
  if (!hecho.length) throw new Error('Esa interconsulta ya no está abierta.');
  await anotar(usuario.id, 'anulo_interconsulta', hecho[0].atencionId, { interconsulta: interconsultaId, motivo: razon });
}

/** Los especialistas activos de cada especialidad pedida, para la lista de administración. */
export async function especialistasPorEspecialidad(buscas: readonly string[]) {
  const porArea = new Map<string, (typeof esquema.especialista.$inferSelect)[]>();
  if (!buscas.length) return porArea;
  const filas = await bd.select().from(esquema.especialista)
    .where(and(eq(esquema.especialista.activo, true), inArray(esquema.especialista.especialidadBusca, [...buscas])))
    .orderBy(asc(esquema.especialista.precio), asc(esquema.especialista.nombre));
  for (const f of filas) porArea.set(f.especialidadBusca, [...(porArea.get(f.especialidadBusca) ?? []), f]);
  return porArea;
}
