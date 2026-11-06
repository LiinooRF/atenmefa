/**
 * Guardado de atenciones. Vive aparte de la pantalla porque lo usan tanto
 * el formulario como la API de autoguardado.
 */
import { eq, sql } from 'drizzle-orm';
import { bd, esquema } from './base';
import { historia, exigidos } from '../historia';

const CLAVES = new Set(historia.flatMap((s) => s.campos.map((c) => c.clave)));

/** Quita tildes y pasa a minúscula, para poder buscar sin depender del acento. */
export const normalizar = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const soloDigitos = (t: string) => t.replace(/\D/g, '');

/** Se queda solo con los campos que el modelo conoce. Lo demás se descarta. */
export function limpiarDatos(form: FormData) {
  const datos: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (!CLAVES.has(k)) continue;
    const valor = String(v).trim();
    if (valor) datos[k] = valor;
  }
  return datos;
}

/** Campos obligatorios que faltan. Vacío = se puede cerrar. */
export function faltantes(datos: Record<string, string>) {
  return exigidos.filter((c) => !datos[c.clave]);
}

/**
 * Busca al paciente por cédula o lo crea. La cédula normalizada es la
 * llave: así "V-12.345.678" y "V12345678" son la misma persona.
 */
export async function pacienteDe(datos: Record<string, string>) {
  const cedulaBusca = soloDigitos(datos.cedula ?? '');
  if (!cedulaBusca) throw new Error('Falta la cédula del paciente.');

  const [ya] = await bd
    .select()
    .from(esquema.paciente)
    .where(eq(esquema.paciente.cedulaBusca, cedulaBusca))
    .limit(1);

  if (ya) {
    // El nombre y el teléfono pueden corregirse en una atención posterior.
    await bd
      .update(esquema.paciente)
      .set({
        nombre: datos.nombre ?? ya.nombre,
        nombreBusca: normalizar(datos.nombre ?? ya.nombre),
        telefono: datos.telefono ?? ya.telefono,
        sexo: datos.sexo ?? ya.sexo,
      })
      .where(eq(esquema.paciente.id, ya.id));
    return ya;
  }

  const [nuevo] = await bd
    .insert(esquema.paciente)
    .values({
      cedula: datos.cedula!,
      cedulaBusca,
      nombre: datos.nombre ?? 'Sin nombre',
      nombreBusca: normalizar(datos.nombre ?? 'Sin nombre'),
      telefono: datos.telefono ?? null,
      sexo: datos.sexo ?? null,
    })
    .returning();

  return nuevo;
}

export async function anotar(
  usuarioId: string,
  accion: string,
  atencionId?: string,
  detalle?: Record<string, unknown>,
) {
  await bd.insert(esquema.bitacora).values({
    usuarioId,
    accion,
    atencionId: atencionId ?? null,
    detalle: detalle ?? null,
  });
}

/** Hoy en Caracas, en formato YYYY-MM-DD. El servidor puede estar en otra zona. */
export function hoyEnVenezuela() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Hora actual en Caracas, HH:MM. */
export function ahoraEnVenezuela() {
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}
