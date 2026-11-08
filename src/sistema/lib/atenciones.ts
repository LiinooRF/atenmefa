/**
 * Guardado de atenciones. Vive aparte de la pantalla porque lo usan tanto
 * el formulario como la API de autoguardado.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { bd, esquema } from './base';
import { historia, exigidos } from '../historia';
import { laboratorio } from '../laboratorio';
import { ROTULO, esTipo, llaveDe, soloDigitos, type TipoDocumento } from './documento';
import { asegurarPin } from './verificacion';

/* Los campos del modelo, más el tipo de documento. Ese no es un campo del
   formulario —no se escribe, se elige en la puerta— pero viaja oculto con
   cada guardado para que el autoguardado sepa con qué llave buscar al
   paciente. Sin él, una atención de un paciente con pasaporte guardada sola
   crearía una persona distinta cada vez. */
const CLAVES = new Set([
  ...historia.flatMap((s) => s.campos.map((c) => c.clave)),
  ...laboratorio.flatMap((s) => s.campos.map((c) => c.clave)),
  'tipo_doc',
  'tipo_atencion',
]);

/** Quita tildes y pasa a minúscula, para poder buscar sin depender del acento. */
export const normalizar = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/* Vive en documento.ts, donde está el resto de lo que sabe leer un
   documento. Se reexporta porque media aplicación lo importa de acá. */
export { soloDigitos };

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
 * Busca al paciente por su documento o lo crea. El documento normalizado es
 * la llave: así "V-12.345.678" y "V12345678" son la misma persona.
 *
 * Casi siempre es una cédula. Cuando no la hay —un extranjero con pasaporte,
 * un recién nacido, alguien que llegó inconsciente sin nada encima— el tipo
 * viaja en datos.tipo_doc y la llave se arma distinto; el porqué está en
 * documento.ts. Sin tipo se asume cédula, que es lo que había antes y lo que
 * sigue mandando el formulario normal.
 */
export async function pacienteDe(datos: Record<string, string>) {
  const tipo: TipoDocumento = esTipo(datos.tipo_doc) ? datos.tipo_doc : 'cedula';
  const cedulaBusca = llaveDe(tipo, datos.cedula ?? '');
  if (!cedulaBusca) {
    throw new Error(
      tipo === 'cedula'
        ? 'Falta la cédula del paciente.'
        : `Falta el documento del paciente (${ROTULO[tipo].toLowerCase()}).`,
    );
  }

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
      tipoDoc: tipo,
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

/* ------------------------------------------------------------------
   Borradores: reabrirlos, terminarlos y saber qué les falta.
   ------------------------------------------------------------------ */

/**
 * Un id que no tiene forma de uuid revienta la consulta antes de buscar:
 * Postgres rechaza el cast y el error sale como falla del servidor. Se
 * filtra acá para poder contestar "no existe" con tranquilidad.
 */
export const esIdentificador = (t: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);

/** La atención con su paciente al lado, como la pide la pantalla de edición. */
export async function atencionPara(id: string) {
  if (!esIdentificador(id)) return null;

  const [fila] = await bd
    .select({
      id: esquema.atencion.id,
      numero: esquema.atencion.numero,
      estado: esquema.atencion.estado,
      fecha: esquema.atencion.fecha,
      datos: esquema.atencion.datos,
      creada: esquema.atencion.creada,
      anuladaMotivo: esquema.atencion.anuladaMotivo,
      paciente: esquema.paciente.nombre,
      cedula: esquema.paciente.cedula,
      /* Hacen falta para saber si quien mira es el dueño del borrador y,
         si no lo es, poder decirle de quién es. */
      medicoId: esquema.atencion.medicoId,
      medico: esquema.user.name,
    })
    .from(esquema.atencion)
    .innerJoin(esquema.paciente, eq(esquema.paciente.id, esquema.atencion.pacienteId))
    .innerJoin(esquema.user, eq(esquema.user.id, esquema.atencion.medicoId))
    .where(eq(esquema.atencion.id, id))
    .limit(1);

  return fila ?? null;
}

/**
 * Escribe los cambios de un borrador. No inserta: actualiza la misma fila,
 * así el número de caso no se mueve.
 *
 * El estado va en el WHERE a propósito. Si alguien cerró o anuló la
 * atención desde otra pestaña mientras esta estaba abierta, la escritura no
 * encuentra fila y devuelve null en vez de revivir un caso ya firmado.
 */
export async function guardarBorrador(
  id: string,
  datos: Record<string, string>,
  cerrar: boolean,
  /* Quién está guardando. Va en el WHERE, no solo comprobado en la
     pantalla: un POST armado a mano contra el borrador de otro médico tiene
     que rebotar en la base, no depender de que la vista lo haya mirado. */
  medicoId: string,
) {
  /* Se mira el estado antes de tocar al paciente. pacienteDe corrige nombre
     y teléfono en la ficha del paciente, que es compartida: si el guardado
     va a rebotar porque la atención ya se cerró, ese arreglo no puede quedar
     escrito igual mientras la pantalla dice que no se guardó nada. */
  const [antes] = await bd
    .select({ estado: esquema.atencion.estado, medicoId: esquema.atencion.medicoId })
    .from(esquema.atencion)
    .where(eq(esquema.atencion.id, id))
    .limit(1);

  if (antes?.estado !== 'borrador') return null;
  if (antes.medicoId !== medicoId) return null;

  const paciente = await pacienteDe(datos);

  const [guardada] = await bd
    .update(esquema.atencion)
    .set({
      // Si corrigieron la cédula, el caso pasa al paciente correcto.
      pacienteId: paciente.id,
      estado: cerrar ? 'cerrada' : 'borrador',
      // Viaja en el formulario porque quien crea la atención suele ser el
      // guardado automático, que no sabe de qué pantalla salió.
      tipo: datos.tipo_atencion === 'laboratorio' ? 'laboratorio' : 'general',
      fecha: datos.fecha,
      aseguradora: datos.aseguradora ?? null,
      poliza: datos.poliza ?? null,
      casoNumero: datos.caso_numero ?? null,
      datos,
      cerrada: cerrar ? new Date() : null,
    })
    .where(and(
      eq(esquema.atencion.id, id),
      eq(esquema.atencion.estado, 'borrador'),
      eq(esquema.atencion.medicoId, medicoId),
    ))
    .returning({ id: esquema.atencion.id, numero: esquema.atencion.numero });

  /* Al cerrarse nace el documento, y con él su PIN de verificación. Acá y no
     en la pantalla: se cierra desde el formulario nuevo, desde la edición de
     un borrador y desde el autoguardado, y un documento sin PIN no se puede
     verificar aunque esté impreso. */
  if (guardada && cerrar) await asegurarPin(guardada.id);

  return guardada ?? null;
}

/**
 * Los borradores sin terminar, del más reciente al más viejo, con la lista
 * de campos que todavía impiden cerrarlos.
 */
export async function borradoresAbiertos(limite = 100) {
  const filas = await bd
    .select({
      id: esquema.atencion.id,
      numero: esquema.atencion.numero,
      fecha: esquema.atencion.fecha,
      creada: esquema.atencion.creada,
      aseguradora: esquema.atencion.aseguradora,
      datos: esquema.atencion.datos,
      paciente: esquema.paciente.nombre,
      cedula: esquema.paciente.cedula,
    })
    .from(esquema.atencion)
    .innerJoin(esquema.paciente, eq(esquema.paciente.id, esquema.atencion.pacienteId))
    .where(eq(esquema.atencion.estado, 'borrador'))
    .orderBy(desc(esquema.atencion.creada))
    .limit(limite);

  /* El diagnóstico y los faltantes se calculan acá y no en la pantalla:
     un genérico dentro del JSX de Astro se parsea como etiqueta. */
  return filas.map(({ datos, ...caso }) => {
    const campos = (datos ?? {}) as Record<string, string>;
    return {
      ...caso,
      idx: campos.idx ?? '',
      motivo: campos.motivo ?? '',
      faltan: faltantes(campos),
    };
  });
}
