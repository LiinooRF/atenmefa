/**
 * Conexión a Postgres. Una sola por proceso.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as esquema from '../base/esquema';
import { exigido } from './entorno';

const url = exigido('BASE_DATOS', 'postgres://usuario:clave@host:5432/atenmefa');

const cliente = postgres(url, { max: 10 });

export const bd = drizzle(cliente, { schema: esquema });
export { esquema };
