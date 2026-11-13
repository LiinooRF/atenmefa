/**
 * Guardado de atenciones. Vive aparte de la pantalla porque lo usan tanto
 * el formulario como la API de autoguardado.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { bd, esquema } from './base';
import { historia, yaLaEscribioElMedico, type Campo } from '../historia';
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
  /* El código CIE-10 del diagnóstico. No es un campo del modelo —no se
     escribe, se elige del catálogo— pero viaja al lado de `idx` y sin esto
     limpiarDatos lo descartaba: el nombre se guardaba y el código no. */
  'idx_codigo',
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

/**
 * Campos obligatorios que faltan. Vacío = se puede cerrar.
 *
 * El tipo de atención decide cuáles son: a una orden de laboratorio no le
 * falta el motivo de consulta, le faltan cuatro datos del paciente. Sin
 * esto, la pantalla de una orden avisaba de veinte campos pendientes que
 * ese formulario no tiene.
 *
 * La edad dejó de ser obligatoria por sí sola: con la fecha de nacimiento
 * alcanza, y el formulario la calcula. Sin ninguna de las dos sí falta, y
 * se avisa igual que siempre —con su rótulo y en su lugar de la lista—.
 * La exigencia «esto o aquello» no la puede escribir el HTML, así que la
 * única garante de la regla es el servidor, que es quien cierra.
 */
export function faltantes(
  datos: Record<string, string>,
  tipo: 'general' | 'laboratorio' = 'general',
): readonly Campo[] {
  const modelo = tipo === 'laboratorio' ? laboratorio : historia;
  const faltan: Campo[] = [];
  for (const s of modelo) {
    for (const c of s.campos) {
      const exigido = c.exigido || (c.clave === 'edad' && !datos.nacimiento);
      if (exigido && !datos[c.clave]) faltan.push(c);
    }
  }
  return faltan;
}

/**
 * Una fecha de nacimiento que se puede guardar, o null.
 *
 * El navegador manda YYYY-MM-DD o nada, pero un POST armado a mano puede
 * mandar lo que sea, y una fecha imposible en la ficha es peor que ningún
 * dato. Se comparan como texto y no con Date: en ISO el orden de las
 * cadenas es el orden de los calendarios.
 */
function nacimientoValido(texto: string | undefined): string | null {
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  if (texto < '1900-01-01' || texto > hoyEnVenezuela()) return null;
  return texto;
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
    /* Los datos de contacto se corrigen desde una atención posterior: el
       formulario los trae escritos y lo que se cambie ahí queda en la ficha.
       Lo que NO se puede desde acá es BORRARLOS: limpiarDatos descarta los
       campos vacíos, así que un campo que se deja en blanco llega ausente y
       conserva lo que había. Borrar es de la ficha del paciente, que sí
       acepta el vacío —ver guardarContacto—, y está bien que sea ahí: en
       medio de una consulta nadie decide vaciar el correo de alguien. */
    await bd
      .update(esquema.paciente)
      .set({
        nombre: datos.nombre ?? ya.nombre,
        nombreBusca: normalizar(datos.nombre ?? ya.nombre),
        telefono: datos.telefono ?? ya.telefono,
        whatsapp: datos.whatsapp ?? ya.whatsapp,
        correo: datos.correo ?? ya.correo,
        sexo: datos.sexo ?? ya.sexo,
        /* La fecha de nacimiento sigue la misma regla que el contacto: lo
           que llega vale, lo que no llega conserva lo que había. Nunca se
           borra desde una atención. */
        nacimiento: nacimientoValido(datos.nacimiento) ?? ya.nacimiento,
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
      whatsapp: datos.whatsapp ?? null,
      correo: datos.correo ?? null,
      sexo: datos.sexo ?? null,
      nacimiento: nacimientoValido(datos.nacimiento),
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
      tipo: esquema.atencion.tipo,
      origenId: esquema.atencion.origenId,
      resultados: esquema.atencion.resultados,
      fecha: esquema.atencion.fecha,
      datos: esquema.atencion.datos,
      creada: esquema.atencion.creada,
      anuladaMotivo: esquema.atencion.anuladaMotivo,
      aseguradora: esquema.atencion.aseguradora,
      paciente: esquema.paciente.nombre,
      pacienteId: esquema.atencion.pacienteId,
      cedula: esquema.paciente.cedula,
      tipoDoc: esquema.paciente.tipoDoc,
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
      /* El TIPO no se toca. Se decide cuando la atención nace y después es
         lo que es: una consulta no se vuelve una orden de laboratorio ni al
         revés. Acá se escribía desde el formulario, y como la pantalla de
         edición no mandaba ese campo, reabrir una orden la convertía en
         atención general: perdía su cola, su pantalla de resultados y
         aparecía entre los casos del médico. */
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
 *
 * Solo atenciones generales. Una orden de laboratorio también es un
 * borrador mientras espera resultados, pero esperar una muestra no es una
 * historia a medio escribir: tiene su propia cola, en /sistema/laboratorio,
 * y mezclarlas llenaba los borradores del médico de gente que nunca pasó
 * por su consulta.
 */
/* El mismo "user" entra dos veces en la consulta de los borradores: una por
   el médico al que está puesta la atención y otra por quien la admitió. Sin
   alias, Postgres no sabe de cuál de las dos se habla. */
const admisor = alias(esquema.user, 'admisor');

export async function borradoresAbiertos(limite = 100) {
  const filas = await bd
    .select({
      id: esquema.atencion.id,
      numero: esquema.atencion.numero,
      fecha: esquema.atencion.fecha,
      creada: esquema.atencion.creada,
      aseguradora: esquema.atencion.aseguradora,
      datos: esquema.atencion.datos,
      tipo: esquema.atencion.tipo,
      /* Lo filtra el WHERE, pero la fila igual lo lleva: quien decide si se
         puede borrar lo mira, y sin la columna venía undefined y el botón
         no aparecía nunca. */
      estado: esquema.atencion.estado,
      /* Para saber quién puede borrar cada uno: el dueño el suyo,
         administración cualquiera. */
      medicoId: esquema.atencion.medicoId,
      medico: esquema.user.name,
      /* Quién lo admitió en el mesón, y su nombre. Nulo quiere decir que lo
         abrió el propio médico: la fila no lleva chapa y se lee como siempre.
         Ver 019-admision.sql. */
      abiertaPor: esquema.atencion.abiertaPor,
      admitio: admisor.name,
      /* Días sin que nadie lo toque, contados como los cuenta el borrado
         automático: la última línea de bitácora, o la creación si no tiene
         ninguna. Así la pantalla avisa con el mismo número con el que se va
         a borrar, y no con otro parecido. */
      quieto: sql<number>`GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
        now() - GREATEST(
          ${esquema.atencion.creada},
          COALESCE((SELECT MAX(b.momento) FROM bitacora b
                     WHERE b.atencion_id = ${esquema.atencion.id}), ${esquema.atencion.creada})
        )
      )) / 86400))::int`,
      paciente: esquema.paciente.nombre,
      cedula: esquema.paciente.cedula,
    })
    .from(esquema.atencion)
    .innerJoin(esquema.paciente, eq(esquema.paciente.id, esquema.atencion.pacienteId))
    .innerJoin(esquema.user, eq(esquema.user.id, esquema.atencion.medicoId))
    /* Izquierdo y no interno: la mayoría de los borradores no tiene quién
       los admitió, y con un join interno la lista se vaciaba. */
    .leftJoin(admisor, eq(admisor.id, esquema.atencion.abiertaPor))
    .where(and(
      eq(esquema.atencion.estado, 'borrador'),
      eq(esquema.atencion.tipo, 'general'),
    ))
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
      quieto: Number(caso.quieto ?? 0),
      /* Si el médico ya le puso algo encima deja de ser «recién admitida»:
         la chapa se va y el caso ya no se lo puede llevar otro. */
      escrita: yaLaEscribioElMedico(campos),
      faltan: faltantes(campos),
    };
  });
}

/* ------------------------------------------------------------------
   Borrar un borrador.
   ------------------------------------------------------------------

   Es la única cosa que se borra de una atención, y se puede porque un
   borrador no está firmado: no entró en el cierre del mes, no se imprimió
   con PIN y no se le entregó a nadie. Lo cerrado se anula con motivo y
   autor, como siempre.

   Quién: el dueño del borrador —el médico el suyo, recepción o el
   bioanalista la orden abierta— y administración cualquiera. Lo pidió así
   el cliente.
   ------------------------------------------------------------------ */

/** Días que sobrevive un borrador que nadie toca. Lo fijó el cliente. */
export const DIAS_DE_BORRADOR = 20;

/**
 * Lo que hay que saber de un borrador antes de borrarlo, para poder dejar
 * constancia de lo que había.
 */
async function resumenDelBorrador(id: string) {
  const [fila] = await bd
    .select({
      id: esquema.atencion.id,
      numero: esquema.atencion.numero,
      estado: esquema.atencion.estado,
      tipo: esquema.atencion.tipo,
      fecha: esquema.atencion.fecha,
      medicoId: esquema.atencion.medicoId,
      paciente: esquema.paciente.nombre,
      cedula: esquema.paciente.cedula,
    })
    .from(esquema.atencion)
    .innerJoin(esquema.paciente, eq(esquema.paciente.id, esquema.atencion.pacienteId))
    .where(eq(esquema.atencion.id, id))
    .limit(1);
  return fila ?? null;
}

/**
 * Borra un borrador y devuelve lo que borró, para la bitácora.
 *
 * El estado va en el WHERE y no solo comprobado antes: entre que la pantalla
 * mostró el botón y alguien lo apretó, el borrador pudo haberse cerrado, y
 * una atención firmada no se borra ni por accidente.
 */
export async function borrarBorrador(id: string) {
  if (!esIdentificador(id)) throw new Error('Esa atención ya no está.');

  const antes = await resumenDelBorrador(id);
  if (!antes) throw new Error('Esa atención ya no está.');
  if (antes.estado !== 'borrador') {
    throw new Error('Esta atención ya no es un borrador: se cerró mientras mirabas la pantalla.');
  }

  const borradas = await bd
    .delete(esquema.atencion)
    .where(and(
      eq(esquema.atencion.id, id),
      eq(esquema.atencion.estado, 'borrador'),
    ))
    .returning({ id: esquema.atencion.id });

  if (borradas.length === 0) {
    throw new Error('Esta atención ya no es un borrador: se cerró mientras mirabas la pantalla.');
  }

  return antes;
}

/**
 * Borra los borradores que nadie tocó en veinte días.
 *
 * Corre cuando alguien abre la lista de borradores. No hay cron y no hace
 * falta: si nadie entra al sistema en veinte días, tampoco le molesta un
 * borrador viejo. Que la limpieza dependa de que alguien mire es feo en
 * teoría y suficiente acá.
 *
 * DOS CONDICIONES, Y LAS DOS IMPORTAN
 *
 *   · «sin tocar» es la última línea de bitácora, no la fecha de creación.
 *     Un borrador abierto hace un mes y editado ayer está vivo;
 *   · se borra solo lo que no tiene NADA adentro: ni renglones de cobro ni
 *     resultados cargados. Si hay plata o mediciones, se queda y lo borra
 *     una persona si quiere. Un cobro que desaparece solo es un agujero en
 *     la caja, y una medición que desaparece sola es peor.
 */
export async function limpiarBorradoresViejos(): Promise<number> {
  const borradas = await bd.execute<{ id: string; numero: number; paciente: string }>(sql`
    WITH viejos AS (
      SELECT a.id
        FROM atencion a
       WHERE a.estado = 'borrador'
         AND GREATEST(
               a.creada,
               COALESCE((SELECT MAX(b.momento) FROM bitacora b WHERE b.atencion_id = a.id), a.creada)
             ) < now() - ${`${DIAS_DE_BORRADOR} days`}::interval
         AND NOT EXISTS (SELECT 1 FROM renglon r WHERE r.atencion_id = a.id)
         AND jsonb_array_length(COALESCE(a.resultados, '[]'::jsonb)) = 0
    )
    DELETE FROM atencion
     WHERE id IN (SELECT id FROM viejos)
    RETURNING id, numero, (SELECT p.nombre FROM paciente p WHERE p.id = paciente_id) AS paciente
  `);

  /* Una línea por borrador que se fue, sin usuario: no lo borró nadie. El
     número y el paciente quedan en el detalle porque la atención ya no
     existe y atencion_id queda en null. */
  for (const b of borradas) {
    await bd.insert(esquema.bitacora).values({
      usuarioId: null,
      accion: 'borro_borrador',
      detalle: {
        automatico: true,
        dias: DIAS_DE_BORRADOR,
        numero: b.numero,
        paciente_nombre: b.paciente,
      },
    });
  }

  return borradas.length;
}
