/**
 * Busca un paciente por cédula para que el médico no reescriba lo que el
 * sistema ya sabe.
 *
 * Devuelve dos cosas separadas a propósito:
 *   · `administrativo`: nombre, edad, sexo, teléfono, dirección. Esto se
 *     rellena solo, porque equivocarse no tiene consecuencia clínica.
 *   · `antecedentes`: alergias, medicación, antecedentes médicos de la
 *     última atención. Esto NO se rellena solo: se muestra para que el
 *     médico lo confirme. Una alergia copiada en silencio desde hace dos
 *     años es peor que no tenerla.
 */
import type { APIRoute } from 'astro';
import { eq, desc, and, ne } from 'drizzle-orm';
import { bd, esquema } from '../../../sistema/lib/base';
import { soloDigitos } from '../../../sistema/lib/atenciones';
import { exigirEnApi } from '../../../sistema/lib/guardia';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const corte = exigirEnApi(ctx, 'escribir_historia');
  if (corte) return corte;

  const cedula = soloDigitos(ctx.url.searchParams.get('cedula') ?? '');
  if (cedula.length < 5) {
    return Response.json({ encontrado: false });
  }

  const [paciente] = await bd
    .select()
    .from(esquema.paciente)
    .where(eq(esquema.paciente.cedulaBusca, cedula))
    .limit(1);

  if (!paciente) return Response.json({ encontrado: false });

  /* La última atención cerrada: de ahí salen los antecedentes y la edad.
     Las anuladas no cuentan, porque quedaron sin efecto. */
  const [ultima] = await bd
    .select({
      numero: esquema.atencion.numero,
      fecha: esquema.atencion.fecha,
      datos: esquema.atencion.datos,
    })
    .from(esquema.atencion)
    .where(and(
      eq(esquema.atencion.pacienteId, paciente.id),
      ne(esquema.atencion.estado, 'anulada'),
    ))
    .orderBy(desc(esquema.atencion.fecha), desc(esquema.atencion.numero))
    .limit(1);

  const d = (ultima?.datos ?? {}) as Record<string, string>;

  /* La edad se recalcula si pasó más de un año desde la última atención:
     copiarla tal cual deja pacientes de 8 años que ya tienen 11. */
  let edad = d.edad ?? '';
  if (edad && ultima?.fecha) {
    const anios = Math.floor(
      (Date.now() - new Date(`${ultima.fecha}T12:00:00`).getTime()) / 31_557_600_000,
    );
    if (anios >= 1) edad = String(Number(edad) + anios);
  }

  const antecedentes = {
    alergias: d.alergias ?? '',
    medicacion: d.medicacion ?? '',
    antecedentes_medicos: d.antecedentes_medicos ?? '',
    quirurgicos: d.quirurgicos ?? '',
    tabaco: d.tabaco ?? '',
    alcohol: d.alcohol ?? '',
  };

  return Response.json({
    encontrado: true,
    administrativo: {
      nombre: paciente.nombre,
      cedula: paciente.cedula,
      telefono: paciente.telefono ?? '',
      sexo: paciente.sexo ?? '',
      edad,
      direccion: d.direccion ?? '',
      ciudad: d.ciudad ?? '',
      referencia: d.referencia ?? '',
      titular: d.titular ?? '',
    },
    antecedentes,
    hayAntecedentes: Object.values(antecedentes).some(Boolean),
    ultima: ultima
      ? {
          numero: ultima.numero,
          fecha: ultima.fecha,
          idx: d.idx ?? '',
        }
      : null,
  });
};
