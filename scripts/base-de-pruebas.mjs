/**
 * Rehace la base de pruebas desde cero.
 *
 *   node scripts/base-de-pruebas.mjs
 *
 * POR QUÉ DESDE CERO Y CADA VEZ
 *
 * La suite comparte una sola base y varias pruebas cuentan filas. Cualquier
 * cosa que haya quedado de una corrida anterior —o de una comprobación hecha
 * a mano— hace fallar una prueba en otro archivo, y la falla sale donde no
 * está el problema. Recrearla cuesta dos segundos y ese tipo de falla
 * fantasma cuesta media hora.
 *
 * Aplica las migraciones en orden y crea las cinco cuentas que las pruebas
 * esperan. La lista de cuentas vive también en pruebas/apoyo.ts (CUENTAS) y
 * en scripts/crear-usuario.mjs; si se agrega una, va en los tres.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { auth } from '../src/sistema/lib/auth.ts';

const CUENTAS = [
  ['Médico de Prueba', 'medico@atenmefa.local', 'clave-de-prueba-1', 'medico', '4279'],
  ['Administración', 'admin@atenmefa.local', 'clave-de-prueba-2', 'administracion', null],
  ['Segundo Médico', 'medico2@atenmefa.local', 'clave-de-prueba-3', 'medico', '9911'],
  ['Bioanalista de Prueba', 'laboratorio@atenmefa.local', 'clave-de-prueba-4', 'bioanalista', 'C.P.B. 7731'],
  ['Recepción de Prueba', 'recepcion@atenmefa.local', 'clave-de-prueba-5', 'recepcionista', null],
];

const cadena = process.env.BASE_DATOS;
if (!cadena) {
  console.error('Falta BASE_DATOS. Exporte el .env primero: set -a; . ./.env; set +a');
  process.exit(1);
}

const url = new URL(cadena);
const nombre = url.pathname.slice(1);

/* Red de seguridad: esto BORRA la base. Que solo pueda apuntar a una de
   pruebas no es paranoia, es que la de producción y la de pruebas se
   diferencian en un sufijo. */
if (!nombre.endsWith('_pruebas')) {
  console.error(`BASE_DATOS apunta a "${nombre}", que no termina en _pruebas. No se toca.`);
  process.exit(1);
}

/* Hay que conectarse a OTRA base para poder borrar esta. `url.origin` no
   sirve: en un esquema que no es http el estándar lo deja en "null". Se
   cambia la ruta y se reusa el resto de la cadena. */
const aPostgres = new URL(cadena);
aPostgres.pathname = '/postgres';

const admin = postgres(aPostgres.toString(), { max: 1 });
await admin.unsafe(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`);
await admin.unsafe(`CREATE DATABASE "${nombre}"`);
await admin.end();
console.log(`Base ${nombre} recreada.`);

const sql = postgres(cadena, { max: 1 });

const carpeta = join(process.cwd(), 'src/sistema/base');
const migraciones = readdirSync(carpeta).filter((f) => f.endsWith('.sql')).sort();
for (const archivo of migraciones) {
  await sql.unsafe(readFileSync(join(carpeta, archivo), 'utf8'));
  console.log(`  ${archivo}`);
}

const ctx = await auth.$context;
for (const [nombreUsuario, correo, clave, rol, colegiatura] of CUENTAS) {
  const id = randomUUID();
  const hash = await ctx.password.hash(clave);
  await sql`
    INSERT INTO "user" (id, name, email, email_verified, rol, colegiatura, activo)
    VALUES (${id}, ${nombreUsuario}, ${correo}, true, ${rol}, ${colegiatura}, true)`;
  await sql`
    INSERT INTO account (id, account_id, provider_id, user_id, password)
    VALUES (${randomUUID()}, ${id}, 'credential', ${id}, ${hash})`;
  console.log(`  ${correo} (${rol})`);
}

await sql.end();
console.log('Listo. Ahora: pnpm build && pnpm pruebas');
