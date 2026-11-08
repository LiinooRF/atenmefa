/**
 * Esquema para Drizzle. Es el reflejo de base/001-inicial.sql, que es la
 * fuente de verdad: las migraciones se escriben en SQL y esto las describe
 * para tener tipos y consultas seguras.
 */
import {
  pgTable, uuid, text, boolean, timestamp, date, numeric, jsonb,
  bigint, bigserial, inet, integer, pgEnum, index, uniqueIndex, primaryKey,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { user } from './auth-esquema';
import type { Resultado } from '../laboratorio';

export { user, session, account, verification } from './auth-esquema';
export const estadoAtencion = pgEnum('estado_atencion', ['borrador', 'cerrada', 'anulada']);
export const pagaQuien = pgEnum('paga_quien', ['paciente', 'aseguradora', 'empresa']);
export const tipoDocumento = pgEnum('tipo_documento', ['cedula', 'pasaporte', 'partida', 'interno']);
export const tipoAtencion = pgEnum('tipo_atencion', ['general', 'laboratorio']);

export const paciente = pgTable('paciente', {
  id: uuid('id').primaryKey().defaultRandom(),
  cedula: text('cedula').notNull(),
  cedulaBusca: text('cedula_busca').notNull().unique(),
  /** Qué es lo que hay en `cedula`. Ver 004-documento.sql. */
  tipoDoc: tipoDocumento('tipo_doc').notNull().default('cedula'),
  nombre: text('nombre').notNull(),
  nombreBusca: text('nombre_busca').notNull(),
  telefono: text('telefono'),
  /** Solo si es distinto del teléfono. Ver 010-contacto.sql. */
  whatsapp: text('whatsapp'),
  correo: text('correo'),
  sexo: text('sexo'),
  nacimiento: date('nacimiento'),
  creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('paciente_nombre_idx').on(t.nombreBusca)]);

/** Una fila por intento de respaldo. Lo escribe el servicio de respaldos. */
export const respaldo = pgTable('respaldo', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  momento: timestamp('momento', { withTimezone: true }).notNull().defaultNow(),
  estado: text('estado').notNull(),
  archivo: text('archivo'),
  bytes: bigint('bytes', { mode: 'number' }),
  detalle: text('detalle'),
});

/** La tasa oficial del BCV, una fila por día publicado. Ver 005-tasa.sql. */
export const tasa = pgTable('tasa', {
  fecha: date('fecha').primaryKey(),
  bolivares: numeric('bolivares', { precision: 18, scale: 6 }).notNull(),
  tomada: timestamp('tomada', { withTimezone: true }).notNull().defaultNow(),
});

export const atencion = pgTable('atencion', {
  id: uuid('id').primaryKey().defaultRandom(),
  numero: bigint('numero', { mode: 'number' }).notNull(),
  pacienteId: uuid('paciente_id').notNull().references(() => paciente.id),
  medicoId: text('medico_id').notNull().references(() => user.id),
  estado: estadoAtencion('estado').notNull().default('borrador'),
  /** Qué formulario le toca. Ver 008-laboratorio.sql. */
  tipo: tipoAtencion('tipo').notNull().default('general'),
  fecha: date('fecha').notNull(),
  periodo: date('periodo').notNull(),
  aseguradora: text('aseguradora'),
  poliza: text('poliza'),
  casoNumero: text('caso_numero'),
  datos: jsonb('datos').$type<Record<string, unknown>>().notNull().default({}),
  anuladaPor: text('anulada_por').references(() => user.id),
  anuladaMotivo: text('anulada_motivo'),
  creada: timestamp('creada', { withTimezone: true }).notNull().defaultNow(),
  cerrada: timestamp('cerrada', { withTimezone: true }),
  /** De qué consulta salieron estos exámenes. Ver 009-roles.sql. */
  origenId: uuid('origen_id').references((): AnyPgColumn => atencion.id),
  /** Un objeto por examen medido. Ver 009-roles.sql. */
  resultados: jsonb('resultados').$type<Resultado[]>().notNull().default([]),
  /** El bioanalista que firma los resultados; no es quien registró la orden. */
  resultadosPor: text('resultados_por').references(() => user.id),
  resultadosEn: timestamp('resultados_en', { withTimezone: true }),
  /** Verificación del documento impreso. Ver 007-verificacion.sql. */
  pin: text('pin'),
  intentosFallidos: integer('intentos_fallidos').notNull().default(0),
  bloqueadaHasta: timestamp('bloqueada_hasta', { withTimezone: true }),
}, (t) => [
  index('atencion_paciente_idx').on(t.pacienteId),
  index('atencion_periodo_idx').on(t.periodo, t.aseguradora),
  index('atencion_fecha_idx').on(t.fecha),
  uniqueIndex('atencion_numero_idx').on(t.numero),
]);

/**
 * El catálogo CIE-10. Las filas las pone 011-diagnosticos.sql, generado
 * desde el catálogo del CEMECE; `frecuente` y `orden` los pone
 * administración desde el panel.
 */
export const diagnostico = pgTable('diagnostico', {
  codigo: text('codigo').primaryKey(),
  /** Oficial y verbatim, en mayúsculas. Se minusculiza al mostrarlo. */
  nombre: text('nombre').notNull(),
  busca: text('busca').notNull(),
  capitulo: text('capitulo').notNull(),
  consulta: boolean('consulta').notNull().default(false),
  /** Nulo no quiere decir "para los dos": el catálogo no lo dice. */
  sexo: text('sexo'),
  frecuente: boolean('frecuente').notNull().default(false),
  orden: integer('orden'),
  marcadoPor: text('marcado_por').references(() => user.id),
  marcadoEn: timestamp('marcado_en', { withTimezone: true }),
});

/**
 * Plantillas de examen del laboratorio, sacadas del archivo de trabajo del
 * cliente. Ver 013-plantillas.sql.
 */
export const plantillaExamen = pgTable('plantilla_examen', {
  examen: text('examen').notNull(),
  orden: integer('orden').notNull(),
  analito: text('analito').notNull(),
  unidad: text('unidad').notNull().default(''),
  /** Vacío significa que su hoja no lo decía en una columna rotulada. */
  referencia: text('referencia').notNull().default(''),
}, (t) => [primaryKey({ columns: [t.examen, t.orden] })]);

export const servicio = pgTable('servicio', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  categoria: text('categoria').notNull(),
  precio: numeric('precio', { precision: 14, scale: 2 }).notNull().default('0'),
  moneda: text('moneda').notNull().default('USD'),
  activo: boolean('activo').notNull().default(true),
});

export const renglon = pgTable('renglon', {
  id: uuid('id').primaryKey().defaultRandom(),
  atencionId: uuid('atencion_id').notNull().references(() => atencion.id, { onDelete: 'cascade' }),
  servicioId: uuid('servicio_id').references(() => servicio.id),
  descripcion: text('descripcion').notNull(),
  cantidad: numeric('cantidad', { precision: 10, scale: 2 }).notNull().default('1'),
  precio: numeric('precio', { precision: 14, scale: 2 }).notNull(),
  moneda: text('moneda').notNull().default('USD'),
  paga: pagaQuien('paga').notNull().default('paciente'),
  creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('renglon_atencion_idx').on(t.atencionId)]);

export const bitacora = pgTable('bitacora', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  usuarioId: text('usuario_id').references(() => user.id),
  accion: text('accion').notNull(),
  atencionId: uuid('atencion_id').references(() => atencion.id),
  detalle: jsonb('detalle'),
  ip: inet('ip'),
  momento: timestamp('momento', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('bitacora_atencion_idx').on(t.atencionId, t.momento),
  index('bitacora_usuario_idx').on(t.usuarioId, t.momento),
]);
