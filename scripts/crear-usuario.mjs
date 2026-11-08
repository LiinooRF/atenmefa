/**
 * Crea un usuario del sistema.
 *
 *   node scripts/crear-usuario.mjs "Nombre" correo@dominio clave rol [colegiatura]
 *
 * rol: medico | administracion | bioanalista | recepcionista
 *
 * Las pruebas de extremo a extremo esperan cinco cuentas:
 *   medico@atenmefa.local       clave-de-prueba-1   medico
 *   medico2@atenmefa.local      clave-de-prueba-3   medico
 *   admin@atenmefa.local        clave-de-prueba-2   administracion
 *   laboratorio@atenmefa.local  clave-de-prueba-4   bioanalista
 *   recepcion@atenmefa.local    clave-de-prueba-5   recepcionista
 * La segunda cuenta médica no es un capricho: sin ella no se puede probar
 * que un borrador lo termina quien lo abrió. Las dos últimas tampoco: la
 * separación entre quien registra la orden y quien carga los resultados es
 * justo lo que hay que vigilar.
 *
 * El registro público está cerrado a propósito (`disableSignUp`), así que
 * esto escribe las filas directo usando el hasher de Better Auth: la clave
 * queda en el mismo formato que valida el login.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { auth } from '../src/sistema/lib/auth.ts';

const [nombre, correo, clave, rol = 'medico', colegiatura] = process.argv.slice(2);

if (!nombre || !correo || !clave) {
  console.error('Uso: node scripts/crear-usuario.mjs "Nombre" correo clave [rol] [colegiatura]');
  process.exit(1);
}
if (!['medico', 'administracion', 'bioanalista', 'recepcionista'].includes(rol)) {
  console.error(`Rol inválido: ${rol}. Debe ser medico, administracion, bioanalista o recepcionista.`);
  process.exit(1);
}
if (clave.length < 10) {
  console.error('La clave debe tener al menos 10 caracteres.');
  process.exit(1);
}

const ctx = await auth.$context;
const hash = await ctx.password.hash(clave);

const sql = postgres(process.env.BASE_DATOS);

const existe = await sql`SELECT id FROM "user" WHERE email = ${correo}`;
if (existe.length) {
  console.error(`Ya existe un usuario con el correo ${correo}.`);
  await sql.end();
  process.exit(1);
}

const id = randomUUID();
await sql.begin(async (tx) => {
  await tx`
    INSERT INTO "user" (id, name, email, email_verified, rol, colegiatura, activo)
    VALUES (${id}, ${nombre}, ${correo}, true, ${rol}, ${colegiatura ?? null}, true)
  `;
  await tx`
    INSERT INTO account (id, account_id, provider_id, user_id, password)
    VALUES (${randomUUID()}, ${id}, 'credential', ${id}, ${hash})
  `;
});
await sql.end();

console.log(`Creado: ${nombre} <${correo}> · ${rol}${colegiatura ? ` · C.M. ${colegiatura}` : ''}`);
