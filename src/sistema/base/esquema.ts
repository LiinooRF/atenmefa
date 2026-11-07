/**
 * Esquema para Drizzle. Es el reflejo de base/001-inicial.sql, que es la
 * fuente de verdad: las migraciones se escriben en SQL y esto las describe
 * para tener tipos y consultas seguras.
 */
import {
  pgTable, uuid, text, boolean, timestamp, date, numeric, jsonb,
  bigint, bigserial, inet, pgEnum, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { user } from './auth-esquema';

export { user, session, account, verification } from './auth-esquema';
export const estadoAtencion = pgEnum('estado_atencion', ['borrador', 'cerrada', 'anulada']);
export const pagaQuien = pgEnum('paga_quien', ['paciente', 'aseguradora', 'empresa']);
export const tipoDocumento = pgEnum('tipo_documento', ['cedula', 'pasaporte', 'partida', 'interno']);

export const paciente = pgTable('paciente', {
  id: uuid('id').primaryKey().defaultRandom(),
  cedula: text('cedula').notNull(),
  cedulaBusca: text('cedula_busca').notNull().unique(),
  /** Qué es lo que hay en `cedula`. Ver 004-documento.sql. */
  tipoDoc: tipoDocumento('tipo_doc').notNull().default('cedula'),
  nombre: text('nombre').notNull(),
  nombreBusca: text('nombre_busca').notNull(),
  telefono: text('telefono'),
  sexo: text('sexo'),
  nacimiento: date('nacimiento'),
  creado: timestamp('creado', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('paciente_nombre_idx').on(t.nombreBusca)]);

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
}, (t) => [
  index('atencion_paciente_idx').on(t.pacienteId),
  index('atencion_periodo_idx').on(t.periodo, t.aseguradora),
  index('atencion_fecha_idx').on(t.fecha),
  uniqueIndex('atencion_numero_idx').on(t.numero),
]);

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
