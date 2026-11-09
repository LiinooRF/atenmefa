/**
 * Alta y mantenimiento de cuentas.
 *
 * El registro público está cerrado a propósito, así que las cuentas se
 * crean desde acá. La clave se guarda con el mismo hasher que valida el
 * login: si se escribiera a mano con otro algoritmo, el usuario quedaría
 * creado y sin poder entrar.
 */
import { randomUUID } from 'node:crypto';
import { eq, asc } from 'drizzle-orm';
import { bd, esquema } from './base';
import { auth } from './auth';
import type { Rol } from './permisos';

/** El orden es el de la pantalla: primero los que más se crean. */
export const ROLES: { valor: Rol; nombre: string; explica: string; firma?: string }[] = [
  { valor: 'medico', nombre: 'Médico', explica: 'Atiende, firma historias y anota qué se le hizo al paciente.',
    firma: 'MPPS y colegio, que van impresos en el récipe.' },
  { valor: 'bioanalista', nombre: 'Bioanalista', explica: 'Carga y firma los resultados del laboratorio. No escribe historias clínicas.',
    firma: 'Colegio de Bioanalistas, que va impreso en el informe.' },
  { valor: 'recepcionista', nombre: 'Recepción', explica: 'Registra al paciente, qué exámenes se le hacen, y cobra.' },
  { valor: 'administracion', nombre: 'Administración', explica: 'Precios, cobro, cierre del mes, anulaciones y cuentas.' },
];

export async function listarUsuarios() {
  return bd
    .select({
      id: esquema.user.id,
      nombre: esquema.user.name,
      correo: esquema.user.email,
      rol: esquema.user.rol,
      colegiatura: esquema.user.colegiatura,
      msds: esquema.user.msds,
      activo: esquema.user.activo,
      creado: esquema.user.createdAt,
    })
    .from(esquema.user)
    .orderBy(asc(esquema.user.name));
}

export async function correoTomado(correo: string, exceptoId?: string) {
  const [ya] = await bd
    .select({ id: esquema.user.id })
    .from(esquema.user)
    .where(eq(esquema.user.email, correo.toLowerCase()))
    .limit(1);
  return Boolean(ya) && ya.id !== exceptoId;
}

export async function hashear(clave: string) {
  const ctx = await auth.$context;
  return ctx.password.hash(clave);
}

export async function crearUsuario(datos: {
  nombre: string;
  correo: string;
  clave: string;
  rol: Rol;
  colegiatura?: string | null;
  msds?: string | null;
}) {
  const id = randomUUID();
  const hash = await hashear(datos.clave);

  await bd.transaction(async (tx) => {
    await tx.insert(esquema.user).values({
      id,
      name: datos.nombre,
      email: datos.correo.toLowerCase(),
      emailVerified: true,
      rol: datos.rol,
      colegiatura: datos.colegiatura || null,
      msds: datos.msds || null,
      activo: true,
    });
    /* La fila de account es donde Better Auth guarda la clave: sin ella el
       usuario existe y el login lo rechaza sin explicar por qué. */
    await tx.insert(esquema.account).values({
      id: randomUUID(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: hash,
    });
  });

  return id;
}

/** Cambiar la clave invalida las sesiones abiertas de ese usuario. */
export async function cambiarClave(usuarioId: string, clave: string) {
  const hash = await hashear(clave);
  await bd
    .update(esquema.account)
    .set({ password: hash })
    .where(eq(esquema.account.userId, usuarioId));
  await bd.delete(esquema.session).where(eq(esquema.session.userId, usuarioId));
}

/**
 * Dar de baja no borra: el usuario queda inactivo. Sus atenciones siguen
 * apuntando a él, que es lo que hace falta para saber quién firmó cada
 * historia cinco años después.
 */
export async function cambiarEstado(usuarioId: string, activo: boolean) {
  await bd.update(esquema.user).set({ activo }).where(eq(esquema.user.id, usuarioId));
  if (!activo) {
    await bd.delete(esquema.session).where(eq(esquema.session.userId, usuarioId));
  }
}

export async function cambiarRol(usuarioId: string, rol: Rol) {
  await bd.update(esquema.user).set({ rol }).where(eq(esquema.user.id, usuarioId));
}

/**
 * Corregir el nombre y las matrículas de una cuenta.
 *
 * Faltaba, y se notaba: la colegiatura solo se podía poner al crear la
 * cuenta, y es lo que sale impreso debajo de la firma en cada informe. Un
 * dedazo en el nombre o una matrícula que llegó después obligaban a borrar
 * la cuenta y crearla otra vez, perdiendo el hilo de quién firmó qué.
 *
 * El correo NO se toca acá: es la llave con la que se entra y cambiarlo
 * desde otra pantalla deja a alguien afuera sin que se entienda por qué.
 */
export async function corregirUsuario(
  usuarioId: string,
  datos: { nombre: string; colegiatura: string; msds: string },
) {
  await bd
    .update(esquema.user)
    .set({
      name: datos.nombre,
      colegiatura: datos.colegiatura || null,
      msds: datos.msds || null,
    })
    .where(eq(esquema.user.id, usuarioId));
}

export async function usuarioPorId(id: string) {
  const [u] = await bd.select().from(esquema.user).where(eq(esquema.user.id, id)).limit(1);
  return u ?? null;
}

/** Mínimos de la clave. Son cuentas internas, no hace falta más ceremonia. */
export function claveFloja(clave: string) {
  if (clave.length < 10) return 'La clave debe tener al menos 10 caracteres.';
  if (/^\d+$/.test(clave)) return 'La clave no puede ser solo números.';
  return null;
}
