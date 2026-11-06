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

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const corte = exigirEnApi(ctx, 'escribir_historia');
  if (corte) return corte;

  const usuario = ctx.locals.usuario!;
  const form = await ctx.request.formData();
  const id = String(form.get('id') ?? '').trim();
  const datos = { fecha: hoyEnVenezuela(), medico: usuario.name, ...limpiarDatos(form) };

  /* Sin cédula y nombre no hay dónde colgar la atención. No es un error:
     el médico todavía no llegó a escribirlos. */
  if (!datos.cedula || !datos.nombre) {
    return Response.json({ guardado: false, motivo: 'faltan-datos-del-paciente' });
  }

  const paciente = await pacienteDe(datos);
  const faltan = faltantes(datos).map((c) => c.rotulo);

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

    return Response.json({ guardado: true, id, faltan });
  }

  const [creada] = await bd
    .insert(esquema.atencion)
    .values({
      pacienteId: paciente.id,
      medicoId: usuario.id,
      estado: 'borrador',
      fecha: datos.fecha,
      aseguradora: datos.aseguradora ?? null,
      poliza: datos.poliza ?? null,
      casoNumero: datos.caso_numero ?? null,
      datos,
    })
    .returning({ id: esquema.atencion.id, numero: esquema.atencion.numero });

  await anotar(usuario.id, 'creo', creada.id, { numero: creada.numero, automatico: true });

  return Response.json({ guardado: true, id: creada.id, numero: creada.numero, faltan, nueva: true });
};
