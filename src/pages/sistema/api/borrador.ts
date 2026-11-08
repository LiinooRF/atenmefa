/**
 * Guardado automático del formulario de atención.
 *
 * Se llama solo mientras el médico escribe. La primera llamada crea la
 * atención y devuelve su id; las siguientes actualizan esa misma fila.
 *
 * Guarda en el servidor y no en el navegador a propósito: si la tablet se
 * queda sin batería en mitad de una consulta, el trabajo tiene que estar
 * en la base, no en el almacenamiento de un equipo apagado.
 */
import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { bd, esquema } from '../../../sistema/lib/base';
import {
  limpiarDatos, faltantes, pacienteDe, anotar, hoyEnVenezuela, esIdentificador,
} from '../../../sistema/lib/atenciones';
import { exigirEnApi } from '../../../sistema/lib/guardia';
import { puede } from '../../../sistema/lib/permisos';
import { sincronizarExamenes } from '../../../sistema/lib/laboratorio';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const usuario = ctx.locals.usuario;
  if (!usuario) return new Response('Sin sesión', { status: 401 });

  const form = await ctx.request.formData();
  const esLab = String(form.get('tipo_atencion') ?? '') === 'laboratorio';

  /* El permiso depende de lo que se esté guardando. Recepción no escribe
     historias clínicas, pero el formulario de laboratorio también se guarda
     solo mientras escribe, y sin esto esa pantalla devolvía 403 en cada
     latido: parecía que no guardaba nada. */
  const corte = exigirEnApi(ctx, esLab ? 'registrar_laboratorio' : 'escribir_historia');
  if (corte) return corte;

  const id = String(form.get('id') ?? '').trim();
  const datos = { fecha: hoyEnVenezuela(), medico: usuario.name, ...limpiarDatos(form) };
  const marcados = form.getAll('examen').map((v) => String(v));

  /* Sin cédula y nombre no hay dónde colgar la atención. No es un error:
     el médico todavía no llegó a escribirlos. */
  if (!datos.cedula || !datos.nombre) {
    return Response.json({ guardado: false, motivo: 'faltan-datos-del-paciente' });
  }

  const paciente = await pacienteDe(datos);
  /* Con el tipo: a una orden de laboratorio no le faltan el motivo de
     consulta ni el diagnóstico, y sin esto la barra de estado del
     formulario de laboratorio avisaba de veinte campos que esa pantalla no
     tiene. */
  const faltan = faltantes(datos, esLab ? 'laboratorio' : 'general').map((c) => c.rotulo);

  /* De qué consulta salió la orden, si salió de una. Se comprueba contra la
     base y contra el paciente: un id puesto a mano en el formulario no
     puede colgarle una orden a la historia de otra persona. */
  const crudoOrigen = String(form.get('origen') ?? '').trim();
  let origenId: string | null = null;
  if (esLab && esIdentificador(crudoOrigen)) {
    const [consulta] = await bd
      .select({ id: esquema.atencion.id })
      .from(esquema.atencion)
      .where(and(
        eq(esquema.atencion.id, crudoOrigen),
        eq(esquema.atencion.tipo, 'general'),
        eq(esquema.atencion.pacienteId, paciente.id),
      ))
      .limit(1);
    origenId = consulta?.id ?? null;
  }

  if (id && esIdentificador(id)) {
    const [antes] = await bd
      .select({ estado: esquema.atencion.estado, medicoId: esquema.atencion.medicoId })
      .from(esquema.atencion)
      .where(eq(esquema.atencion.id, id))
      .limit(1);

    /* Si se cerró o la abrió otro médico, el guardado automático se calla:
       no puede revivir un caso firmado ni escribir sobre el de otro. */
    if (!antes || antes.estado !== 'borrador' || antes.medicoId !== usuario.id) {
      return Response.json({ guardado: false, motivo: 'ya-no-se-puede-editar' });
    }

    await bd
      .update(esquema.atencion)
      .set({
        pacienteId: paciente.id,
        fecha: datos.fecha,
        aseguradora: datos.aseguradora ?? null,
        poliza: datos.poliza ?? null,
        casoNumero: datos.caso_numero ?? null,
        datos,
      })
      .where(and(
        eq(esquema.atencion.id, id),
        eq(esquema.atencion.estado, 'borrador'),
        eq(esquema.atencion.medicoId, usuario.id),
      ));

    /* Sincronizar y no insertar: cada latido manda la lista completa de
       casillas marcadas, así que esto corre muchas veces por orden. Es
       idempotente a propósito —ver sincronizarExamenes—; si insertara sin
       comparar, una orden de tres exámenes terminaría cobrada cinco veces. */
    if (esLab) await sincronizarExamenes(id, marcados, datos.aseguradora);

    return Response.json({ guardado: true, id, faltan });
  }

  const [creada] = await bd
    .insert(esquema.atencion)
    .values({
      pacienteId: paciente.id,
      medicoId: usuario.id,
      estado: 'borrador',
      /* Acá se CREA la atención, así que acá se decide de qué tipo es. El
         formulario lo manda en un campo oculto: esta ruta no sabe de qué
         pantalla vino. */
      tipo: esLab ? 'laboratorio' : 'general',
      origenId,
      fecha: datos.fecha,
      aseguradora: datos.aseguradora ?? null,
      poliza: datos.poliza ?? null,
      casoNumero: datos.caso_numero ?? null,
      datos,
    })
    .returning({ id: esquema.atencion.id, numero: esquema.atencion.numero });

  if (esLab) await sincronizarExamenes(creada.id, marcados, datos.aseguradora);
  await anotar(usuario.id, 'creo', creada.id, { numero: creada.numero, automatico: true });

  return Response.json({ guardado: true, id: creada.id, numero: creada.numero, faltan, nueva: true });
};
