/**
 * Derivar desde adentro de la atención.
 *
 * El formulario de la historia es uno solo y se guarda solo mientras el
 * médico escribe; un formulario de derivación adentro de él no puede ser
 * otro <form>. Así que el bloque «Derivar al paciente» habla con esto:
 *
 *   GET  ?atencion=<id>   lo que ya se derivó y con qué se puede derivar
 *   POST                  deriva (las mismas reglas que desde la ficha)
 *
 * Las reglas están en lib/interconsultas.ts. Acá no se decide nada.
 */
import type { APIRoute } from 'astro';
import { exigirEnApi } from '../../../sistema/lib/guardia';
import { esIdentificador } from '../../../sistema/lib/atenciones';
import { ajustes } from '../../../sistema/lib/ajustes';
import {
  ROTULO_TIPO, destinoDe, especialidades, especialistasDelCentro, interconsultasDe,
  pedirInterconsulta, rotuloEstado,
} from '../../../sistema/lib/interconsultas';

export const prerender = false;

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async (ctx) => {
  const corte = exigirEnApi(ctx, 'ver_historia');
  if (corte) return corte;
  const usuario = ctx.locals.usuario!;
  const atencion = ctx.url.searchParams.get('atencion') ?? '';

  const [lista, delCentro, areas, config] = await Promise.all([
    esIdentificador(atencion) ? interconsultasDe(atencion) : Promise.resolve([]),
    especialistasDelCentro(),
    especialidades(),
    ajustes(),
  ]);
  return json({
    derivaciones: lista.map((d) => ({
      destino: destinoDe(d),
      tipo: ROTULO_TIPO[d.tipo],
      estado: rotuloEstado(d.estado, d.tipo),
      porRecepcion: d.porRecepcion,
    })),
    delCentro: delCentro.filter((m) => m.id !== usuario.id),
    especialidades: areas,
    recepcion: config.recepcion_derivaciones ? {
      interna: config.recepcion_interna, externa: config.recepcion_externa, traslado: config.recepcion_traslado,
    } : null,
  });
};

export const POST: APIRoute = async (ctx) => {
  const corte = exigirEnApi(ctx, 'pedir_interconsulta');
  if (corte) return corte;
  const form = await ctx.request.formData();
  const atencion = String(form.get('atencion') ?? '');
  if (!esIdentificador(atencion)) return json({ error: 'Primero se tiene que guardar la atención.' }, 400);
  const especialidad = String(form.get('especialidad') ?? '');
  try {
    await pedirInterconsulta(ctx.locals.usuario!, atencion, {
      tipo: form.get('tipo'),
      especialidad: especialidad === '__otra' ? form.get('otra') : especialidad,
      medicoId: form.get('medico'),
      centro: form.get('centro'),
      ambulancia: form.get('ambulancia'),
      paramedico: form.get('paramedico'),
      motivo: form.get('motivo'),
      porRecepcion: form.get('por_recepcion') === 'si',
    });
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'No se pudo derivar.' }, 400);
  }
};
