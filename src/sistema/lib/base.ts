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

/* Los permisos configurables (035) llenan su caché de arranque: la
   primera lectura de puede() ya ve lo que administración encendió.
   Si la base tarda, la promesa no bloquea: vale el paquete base hasta
   que llegue. */
void (async () => {
  try {
    const filas = await bd.select().from(esquema.rolPermiso);
    const { ponerCache } = await import('./permisos-roles-cache');
    ponerCache(filas);
  } catch {
    /* sin desviaciones en memoria: vale el paquete base */
  }
})();
