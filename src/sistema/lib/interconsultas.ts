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
import { and, asc, desc, eq, inArray, isNotNull, ne, or } from 'drizzle-orm';
import { bd, esquema } from './base';
import { anotar, esIdentificador, normalizar, hoyEnVenezuela, ahoraEnVenezuela } from './atenciones';
import { ajustes } from './ajustes';
import { montoDe } from './cobro';
import { puede } from './permisos';
import { enlaceDeWhatsApp, paraWhatsApp } from './telefono';
import { marca } from '../../data/marca';
import type { Usuario } from './auth';

export type EstadoInterconsulta = 'pendiente' | 'contactada' | 'atendida' | 'anulada';
export type TipoDerivacion = 'interna' | 'externa' | 'traslado';

export const ROTULO_TIPO: Record<TipoDerivacion, string> = {
  interna: 'Especialista del centro',
  externa: 'Especialista de afuera',
  traslado: 'Traslado a otro centro',
};

const ESTADOS: Record<EstadoInterconsulta, string> = {
  pendiente: 'Pendiente',
  contactada: 'Especialista contactado',
  atendida: 'Atendida',
  anulada: 'Anulada',
};

/** Cómo se dice el estado: un traslado hecho no es una consulta «atendida». */
export const rotuloEstado = (estado: EstadoInterconsulta, tipo: TipoDerivacion = 'externa') =>
  tipo === 'traslado' && estado === 'atendida' ? 'Trasladado' : ESTADOS[estado];

/** Lo que va a decir la derivación en una línea: el área, el médico o el lugar. */
export const destinoDe = (d: {
  tipo: TipoDerivacion; especialidad: string | null; destinoMedico?: string | null; destinoCentro?: string | null;
}) => d.tipo === 'traslado' ? `Traslado a ${d.destinoCentro ?? ''}`
  : d.tipo === 'interna' ? `${d.especialidad ?? ''} · ${d.destinoMedico ?? ''}`
  : d.especialidad ?? '';

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
   Las derivaciones.
   ------------------------------------------------------------------ */

/** Los médicos del centro con especialidad: a ellos se les deriva adentro. */
export async function especialistasDelCentro() {
  return bd
    .select({ id: esquema.user.id, nombre: esquema.user.name, especialidad: esquema.user.especialidad })
    .from(esquema.user)
    .where(and(
      eq(esquema.user.rol, 'medico'),
      eq(esquema.user.activo, true),
      isNotNull(esquema.user.especialidad),
      ne(esquema.user.especialidad, ''),
    ))
    .orderBy(asc(esquema.user.especialidad), asc(esquema.user.name));
}

export interface PedidoDeDerivacion {
  tipo: unknown;
  especialidad?: unknown;
  medicoId?: unknown;
  centro?: unknown;
  ambulancia?: unknown;
  paramedico?: unknown;
  motivo?: unknown;
  porRecepcion?: unknown;
}

/** El médico la pide desde la consulta. Lanza con el motivo. */
export async function pedirInterconsulta(usuario: Usuario, atencionId: string, entrada: PedidoDeDerivacion) {
  if (!puede(usuario.rol as string, 'pedir_interconsulta')) {
    throw new Error('Las derivaciones las pide el médico.');
  }
  const [caso] = await bd
    .select({ tipo: esquema.atencion.tipo, estado: esquema.atencion.estado })
    .from(esquema.atencion).where(eq(esquema.atencion.id, atencionId)).limit(1);
  if (!caso) throw new Error('Esa atención no existe.');
  if (caso.tipo !== 'general') throw new Error('Las derivaciones salen de una consulta, no de una orden de laboratorio.');
  if (caso.estado === 'anulada') throw new Error('Esta atención está anulada.');

  const tipo = String(entrada.tipo ?? 'externa') as TipoDerivacion;
  if (!['interna', 'externa', 'traslado'].includes(tipo)) throw new Error('Elija a dónde se deriva.');
  const motivo = String(entrada.motivo ?? '').replace(/\r\n?/g, '\n').trim();
  if (motivo.length > 2000) throw new Error('El motivo es demasiado largo: hasta 2000 caracteres.');

  /* Si el centro no usa el paso por recepción, no se guarda aunque llegue
     marcado: una derivación esperando en una cola que nadie mira es una
     derivación perdida. */
  const config = await ajustes();
  const porRecepcion = config.recepcion_derivaciones && Boolean(entrada.porRecepcion);

  let especialidad: string | null = null;
  let destinoMedicoId: string | null = null;
  let destinoCentro: string | null = null;
  let ambulancia: boolean | null = null;
  let paramedico: string | null = null;

  if (tipo === 'externa') {
    especialidad = corto(entrada.especialidad, 120);
    if (!especialidad) throw new Error('Elija la especialidad.');
  } else if (tipo === 'interna') {
    const id = String(entrada.medicoId ?? '');
    const medico = (await especialistasDelCentro()).find((m) => m.id === id);
    if (!medico) throw new Error('Elija al especialista del centro.');
    if (medico.id === usuario.id) throw new Error('No se puede derivar a uno mismo.');
    destinoMedicoId = medico.id;
    especialidad = medico.especialidad;
  } else {
    destinoCentro = corto(entrada.centro, 160);
    if (!destinoCentro) throw new Error('Escriba a qué centro u hospital se traslada.');
    ambulancia = entrada.ambulancia === 'si' || entrada.ambulancia === true;
    paramedico = corto(entrada.paramedico, 120) || null;
  }
  const busca = especialidad ? normalizar(especialidad) : '';

  /* Lo mismo dos veces en la misma consulta es casi siempre un doble clic,
     y le escribiría dos veces al mismo especialista. */
  const abiertas = await bd
    .select({
      tipo: esquema.interconsulta.tipo,
      busca: esquema.interconsulta.especialidadBusca,
      medico: esquema.interconsulta.destinoMedicoId,
    })
    .from(esquema.interconsulta)
    .where(and(
      eq(esquema.interconsulta.atencionId, atencionId),
      inArray(esquema.interconsulta.estado, ['pendiente', 'contactada']),
    ));
  const repetida = abiertas.some((a) => a.tipo === tipo && (
    tipo === 'externa' ? a.busca === busca : tipo === 'interna' ? a.medico === destinoMedicoId : true));
  if (repetida) {
    throw new Error(tipo === 'traslado'
      ? 'Ya hay un traslado abierto para esta consulta.'
      : `Ya hay una derivación a ${especialidad} abierta para esta consulta.`);
  }

  const [nueva] = await bd.insert(esquema.interconsulta).values({
    atencionId, tipo, especialidad, especialidadBusca: busca, motivo, pedidaPor: usuario.id,
    destinoMedicoId, destinoCentro, ambulancia, paramedico, porRecepcion,
  }).returning({ id: esquema.interconsulta.id });
  await anotar(usuario.id, 'pidio_derivacion', atencionId, { tipo, especialidad, destinoCentro, interconsulta: nueva.id });
  return nueva.id;
}

const destino = alias(esquema.user, 'destino');

/** Las de una consulta, para su ficha. */
export async function interconsultasDe(atencionId: string) {
  const medico = alias(esquema.user, 'medico');
  return bd
    .select({
      id: esquema.interconsulta.id,
      tipo: esquema.interconsulta.tipo,
      especialidad: esquema.interconsulta.especialidad,
      motivo: esquema.interconsulta.motivo,
      estado: esquema.interconsulta.estado,
      pedida: esquema.interconsulta.pedida,
      contactada: esquema.interconsulta.contactada,
      porRecepcion: esquema.interconsulta.porRecepcion,
      destinoCentro: esquema.interconsulta.destinoCentro,
      ambulancia: esquema.interconsulta.ambulancia,
      destinoMedico: destino.name,
      atencionDestinoId: esquema.interconsulta.atencionDestinoId,
      medico: medico.name,
      especialista: esquema.especialista.nombre,
      anuladaMotivo: esquema.interconsulta.anuladaMotivo,
    })
    .from(esquema.interconsulta)
    .innerJoin(medico, eq(medico.id, esquema.interconsulta.pedidaPor))
    .leftJoin(destino, eq(destino.id, esquema.interconsulta.destinoMedicoId))
    .leftJoin(esquema.especialista, eq(esquema.especialista.id, esquema.interconsulta.especialistaId))
    .where(eq(esquema.interconsulta.atencionId, atencionId))
    .orderBy(asc(esquema.interconsulta.pedida));
}

/**
 * Las abiertas que le tocan a quien mira el panel.
 *
 * Administración ve todas. Recepción, las que el médico mandó a pasar por
 * recepción. Un médico, las que le derivaron a él y las que pidió.
 */
export async function interconsultasAbiertas(usuario: Usuario) {
  const rol = usuario.rol as string;
  const medico = alias(esquema.user, 'medico');
  const abierta = inArray(esquema.interconsulta.estado, ['pendiente', 'contactada']);
  const alcance = puede(rol, 'gestionar_interconsultas') ? abierta
    : puede(rol, 'derivaciones_recepcion') ? and(abierta, eq(esquema.interconsulta.porRecepcion, true))
    : and(abierta, or(
      eq(esquema.interconsulta.destinoMedicoId, usuario.id),
      eq(esquema.interconsulta.pedidaPor, usuario.id),
    ));
  return bd
    .select({
      id: esquema.interconsulta.id,
      tipo: esquema.interconsulta.tipo,
      especialidad: esquema.interconsulta.especialidad,
      especialidadBusca: esquema.interconsulta.especialidadBusca,
      motivo: esquema.interconsulta.motivo,
      estado: esquema.interconsulta.estado,
      pedida: esquema.interconsulta.pedida,
      contactada: esquema.interconsulta.contactada,
      porRecepcion: esquema.interconsulta.porRecepcion,
      destinoMedicoId: esquema.interconsulta.destinoMedicoId,
      destinoMedico: destino.name,
      destinoCentro: esquema.interconsulta.destinoCentro,
      ambulancia: esquema.interconsulta.ambulancia,
      paramedico: esquema.interconsulta.paramedico,
      pedidaPor: esquema.interconsulta.pedidaPor,
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
    .leftJoin(destino, eq(destino.id, esquema.interconsulta.destinoMedicoId))
    .leftJoin(esquema.especialista, eq(esquema.especialista.id, esquema.interconsulta.especialistaId))
    .where(alcance)
    .orderBy(desc(esquema.interconsulta.estado), asc(esquema.interconsulta.pedida));
}

/** Cuántas esperan que alguien las mueva. */
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

/** La derivación, si quien pregunta la puede mover. Lanza si no. */
async function derivacionParaGestionar(usuario: Usuario, id: string) {
  if (!esIdentificador(id)) throw new Error('Esa derivación ya no está.');
  const [d] = await bd.select().from(esquema.interconsulta).where(eq(esquema.interconsulta.id, id)).limit(1);
  if (!d) throw new Error('Esa derivación ya no está.');
  const rol = usuario.rol as string;
  const deAdmin = puede(rol, 'gestionar_interconsultas');
  const deRecepcion = puede(rol, 'derivaciones_recepcion') && d.porRecepcion;
  if (!deAdmin && !deRecepcion) throw new Error('Las derivaciones las lleva administración.');
  return d;
}

/**
 * Deja anotado a quién se le escribió y devuelve el enlace de WhatsApp.
 * Se anota ANTES de abrir el chat: si se anotara después, cerrar la
 * pestaña de WhatsApp dejaría la derivación como si nadie hubiera escrito.
 */
export async function contactar(usuario: Usuario, interconsultaId: string, especialistaId: string) {
  const ic = await derivacionParaGestionar(usuario, interconsultaId);
  if (ic.tipo !== 'externa') throw new Error('Solo a un especialista de afuera se le escribe desde acá.');
  if (!['pendiente', 'contactada'].includes(ic.estado)) throw new Error('Esa derivación ya no está abierta.');
  if (!esIdentificador(especialistaId)) throw new Error('Ese especialista no está disponible.');
  const esp = await especialistaPorId(especialistaId);
  if (!esp || !esp.activo) throw new Error('Ese especialista no está disponible.');
  if (!esp.whatsapp) throw new Error(`${esp.nombre} no tiene WhatsApp cargado.`);
  /* El especialista tiene que ser del área que se pidió: un toque en la
     fila equivocada no le escribe a un traumatólogo por un riñón. */
  if (esp.especialidadBusca !== ic.especialidadBusca) throw new Error(`${esp.nombre} no es de ${ic.especialidad}.`);

  await bd.update(esquema.interconsulta).set({
    estado: 'contactada', especialistaId: esp.id, contactadaPor: usuario.id, contactada: new Date(),
  }).where(eq(esquema.interconsulta.id, interconsultaId));
  await anotar(usuario.id, 'contacto_especialista', ic.atencionId, {
    interconsulta: interconsultaId, especialista: esp.nombre,
  });
  return enlaceDeWhatsApp(esp.whatsapp, mensajeAlEspecialista(ic.especialidad ?? ''));
}

/** El especialista de afuera ya lo vio, o el traslado se hizo. */
export async function marcarAtendida(usuario: Usuario, interconsultaId: string) {
  const ic = await derivacionParaGestionar(usuario, interconsultaId);
  const puedeCerrar = (ic.tipo === 'externa' && ic.estado === 'contactada')
    || (ic.tipo === 'traslado' && ic.estado === 'pendiente');
  if (!puedeCerrar) {
    throw new Error(ic.tipo === 'externa' ? 'Primero hay que contactar al especialista.'
      : ic.tipo === 'interna' ? 'Esta la cierra el especialista al atenderla.'
      : 'Ese traslado ya no está abierto.');
  }
  await bd.update(esquema.interconsulta).set({ estado: 'atendida', atendida: new Date() })
    .where(eq(esquema.interconsulta.id, interconsultaId));
  await anotar(usuario.id, 'interconsulta_atendida', ic.atencionId, { interconsulta: interconsultaId, tipo: ic.tipo });
}

/**
 * Abre la consulta del especialista del centro, colgada de la que lo
 * derivó. La abre él mismo desde su panel, o recepción cuando el médico la
 * mandó a pasar por el mesón: en los dos casos queda a nombre del
 * especialista. Devuelve el id de la consulta nueva.
 */
export async function abrirConsultaDerivada(usuario: Usuario, interconsultaId: string) {
  if (!esIdentificador(interconsultaId)) throw new Error('Esa derivación ya no está.');
  const [d] = await bd.select().from(esquema.interconsulta).where(eq(esquema.interconsulta.id, interconsultaId)).limit(1);
  if (!d || d.tipo !== 'interna' || !d.destinoMedicoId) throw new Error('Esa derivación ya no está.');
  if (d.estado !== 'pendiente') throw new Error('Esa derivación ya se atendió.');

  const esElEspecialista = d.destinoMedicoId === usuario.id;
  const esRecepcion = d.porRecepcion && puede(usuario.rol as string, 'derivaciones_recepcion');
  const esAdmin = puede(usuario.rol as string, 'gestionar_interconsultas');
  if (!esElEspecialista && !esRecepcion && !esAdmin) {
    throw new Error('Esta derivación la abre el especialista o recepción.');
  }

  const [origen] = await bd.select({ pacienteId: esquema.atencion.pacienteId, datos: esquema.atencion.datos, medico: esquema.user.name })
    .from(esquema.atencion).innerJoin(esquema.user, eq(esquema.user.id, esquema.atencion.medicoId))
    .where(eq(esquema.atencion.id, d.atencionId)).limit(1);
  const [especialista] = await bd.select({ nombre: esquema.user.name }).from(esquema.user)
    .where(eq(esquema.user.id, d.destinoMedicoId)).limit(1);
  if (!origen || !especialista) throw new Error('Esa derivación ya no está.');

  /* Lo de quién es el paciente se copia de la consulta que lo derivó, como
     cuando recepción lo admite: el especialista no vuelve a preguntar el
     nombre ni la cédula. Lo clínico no se copia: es otra consulta. */
  const previos = (origen.datos ?? {}) as Record<string, string>;
  const COPIAR = ['nombre', 'cedula', 'tipo_doc', 'telefono', 'whatsapp', 'correo', 'sexo', 'nacimiento',
    'edad', 'direccion', 'ciudad', 'referencia', 'aseguradora', 'poliza'];
  const datos: Record<string, string> = {};
  for (const k of COPIAR) if (previos[k]) datos[k] = previos[k];
  datos.fecha = hoyEnVenezuela();
  datos.hora_inicio = ahoraEnVenezuela();
  datos.medico = especialista.nombre;
  datos.motivo = `Derivado por ${origen.medico}${d.motivo ? `: ${d.motivo}` : ''}`.slice(0, 2000);

  const nueva = await bd.transaction(async (tx) => {
    const [creada] = await tx.insert(esquema.atencion).values({
      pacienteId: origen.pacienteId,
      medicoId: d.destinoMedicoId!,
      abiertaPor: usuario.id,
      estado: 'borrador',
      tipo: 'general',
      origenId: d.atencionId,
      fecha: datos.fecha,
      aseguradora: datos.aseguradora ?? null,
      poliza: datos.poliza ?? null,
      datos,
    /* El número y el período los genera la base (GENERATED ALWAYS, ver
       002-clinico.sql); el esquema de drizzle no lo sabe y los pide. */
    } as typeof esquema.atencion.$inferInsert).returning({ id: esquema.atencion.id, numero: esquema.atencion.numero });
    const hecho = await tx.update(esquema.interconsulta)
      .set({ estado: 'atendida', atendida: new Date(), atencionDestinoId: creada.id })
      .where(and(eq(esquema.interconsulta.id, interconsultaId), eq(esquema.interconsulta.estado, 'pendiente')))
      .returning({ id: esquema.interconsulta.id });
    // Dos toques a la vez: el segundo no abre otra consulta.
    if (!hecho.length) throw new Error('Esa derivación ya se atendió.');
    return creada;
  });
  await anotar(usuario.id, 'abrio_derivacion', nueva.id, { interconsulta: interconsultaId, numero: nueva.numero });
  return { id: nueva.id, esElEspecialista };
}

/** Se anula con motivo, no se borra. */
export async function anularInterconsulta(usuario: Usuario, interconsultaId: string, motivo: unknown) {
  await derivacionParaGestionar(usuario, interconsultaId);
  const razon = corto(motivo, 1000);
  if (!razon) throw new Error('Escriba por qué se anula.');
  const hecho = await bd.update(esquema.interconsulta)
    .set({ estado: 'anulada', anuladaPor: usuario.id, anuladaMotivo: razon })
    .where(and(
      eq(esquema.interconsulta.id, interconsultaId),
      inArray(esquema.interconsulta.estado, ['pendiente', 'contactada']),
    ))
    .returning({ atencionId: esquema.interconsulta.atencionId });
  if (!hecho.length) throw new Error('Esa derivación ya no está abierta.');
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
