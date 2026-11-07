/**
 * Esquema para Drizzle de las tablas de medición del sitio público.
 *
 * Igual que esquema.ts: la fuente de verdad es el SQL (003-visitas.sql) y
 * esto lo describe para tener tipos. El porqué de cada columna —sobre todo
 * por qué no hay IP en ninguna parte— está escrito en la migración.
 */
import { pgTable, pgEnum, bigint, text, timestamp, index } from 'drizzle-orm/pg-core';

export const dispositivoVisita = pgEnum('dispositivo_visita', [
  'movil', 'escritorio', 'tablet',
]);

export const tipoEvento = pgEnum('tipo_evento', [
  'llamar', 'whatsapp', 'como_llegar', 'ver_servicio', 'instagram', 'correo',
]);

export const visita = pgTable('visita', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  momento: timestamp('momento', { withTimezone: true }).notNull().defaultNow(),
  ruta: text('ruta').notNull(),
  /** Solo el dominio del referente. Nulo si entró directo. */
  referente: text('referente'),
  dispositivo: dispositivoVisita('dispositivo').notNull(),
  /** Nulo cuando el user-agent no deja reconocerlo; no se adivina. */
  navegador: text('navegador'),
  /** Dos letras, solo si el proxy lo manda. Nunca se deduce de la IP. */
  pais: text('pais'),
  /** Hash con sal del día. No permite seguir a nadie entre días. */
  huella: text('huella').notNull(),
}, (t) => [
  index('visita_momento_idx').on(t.momento),
  index('visita_ruta_idx').on(t.ruta, t.momento),
]);

export const evento = pgTable('evento', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  momento: timestamp('momento', { withTimezone: true }).notNull().defaultNow(),
  tipo: tipoEvento('tipo').notNull(),
  /** Lo pone el servidor a partir de la ruta, nunca el navegador. */
  detalle: text('detalle'),
  ruta: text('ruta').notNull(),
  huella: text('huella').notNull(),
}, (t) => [
  index('evento_momento_idx').on(t.momento),
  index('evento_tipo_idx').on(t.tipo, t.momento),
  index('evento_huella_idx').on(t.huella),
]);

export type Visita = typeof visita.$inferSelect;
export type Evento = typeof evento.$inferSelect;
export type TipoDeEvento = (typeof tipoEvento.enumValues)[number];
export type Dispositivo = (typeof dispositivoVisita.enumValues)[number];
