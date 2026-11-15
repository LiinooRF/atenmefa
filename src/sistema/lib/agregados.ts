/**
 * Lo que se le agrega a una atención cerrada.
 *
 * Una atención cerrada no se edita: es lo que se firmó y lo que se le
 * entregó al paciente. Lo que vino después —una nota, un diagnóstico que no
 * estaba, unos exámenes— se suma debajo, con su fecha y su autor. Ver
 * 024-agregados.sql.
 *
 * Todas las reglas se miran acá y no en la pantalla: el formulario se
 * puede armar a mano, y que un borrador o una anulada acepten agregados
 * sería escribirle a una historia por la puerta de atrás.
 */
import { alias } from 'drizzle-orm/pg-core';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { bd, esquema } from './base';
import { anotar, esIdentificador } from './atenciones';
import { puede } from './permisos';
import type { Usuario } from './auth';

export type TipoAgregado = 'nota' | 'diagnostico' | 'examenes';

export const ROTULO_AGREGADO: Record<TipoAgregado, string> = {
  nota: 'Nota',
  diagnostico: 'Diagnóstico',
  examenes: 'Exámenes indicados',
};

const TIPOS: readonly TipoAgregado[] = ['nota', 'diagnostico', 'examenes'];
const LARGO_MAXIMO = 4000;

const esTipo = (t: string): t is TipoAgregado => (TIPOS as readonly string[]).includes(t);

/** Un exámen por línea, sin líneas vacías ni espacios de más. */
export const lineasDeExamenes = (texto: string) =>
  texto.split('\n').map((l) => l.trim()).filter(Boolean);

/** Los agregados de una atención, del más viejo al más nuevo. */
export async function agregadosDe(atencionId: string) {
  const autor = alias(esquema.user, 'autor');
  const anulador = alias(esquema.user, 'anulador');
  return bd
    .select({
      id: esquema.agregado.id,
      tipo: esquema.agregado.tipo,
      texto: esquema.agregado.texto,
      codigo: esquema.agregado.codigo,
      creado: esquema.agregado.creado,
      ordenId: esquema.agregado.ordenId,
      autor: autor.name,
      colegiatura: autor.colegiatura,
      anuladoPor: anulador.name,
      anuladoMotivo: esquema.agregado.anuladoMotivo,
      anuladoEn: esquema.agregado.anuladoEn,
    })
    .from(esquema.agregado)
    .innerJoin(autor, eq(autor.id, esquema.agregado.autorId))
    .leftJoin(anulador, eq(anulador.id, esquema.agregado.anuladoPor))
    .where(eq(esquema.agregado.atencionId, atencionId))
    .orderBy(asc(esquema.agregado.creado));
}

/**
 * Suma un agregado. Lanza con un motivo que se le puede mostrar a quien lo
 * intentó.
 */
export async function agregar(
  usuario: Usuario,
  atencionId: string,
  entrada: { tipo: string; texto: string; codigo?: string },
) {
  if (!puede(usuario.rol as string, 'agregar_al_caso')) {
    throw new Error('Solo el personal médico le agrega notas a una atención cerrada.');
  }

  const [caso] = await bd
    .select({ tipo: esquema.atencion.tipo, estado: esquema.atencion.estado })
    .from(esquema.atencion)
    .where(eq(esquema.atencion.id, atencionId))
    .limit(1);
  if (!caso) throw new Error('Esa atención no existe.');
  if (caso.tipo !== 'general') {
    throw new Error('Solo se les agrega a las consultas, no a las órdenes de laboratorio.');
  }
  /* Un borrador se sigue escribiendo en su formulario, y una anulada ya no
     cuenta: a ninguna de las dos le corresponde un agregado. */
  if (caso.estado !== 'cerrada') {
    throw new Error(caso.estado === 'borrador'
      ? 'Esta atención todavía está abierta: se completa en su formulario.'
      : 'Esta atención está anulada y ya no se le agrega nada.');
  }

  if (!esTipo(entrada.tipo)) throw new Error('No se entendió qué se quiere agregar.');
  const tipo = entrada.tipo;

  let texto = String(entrada.texto ?? '').replace(/\r\n?/g, '\n').trim();
  if (tipo === 'examenes') texto = lineasDeExamenes(texto).join('\n');
  if (!texto) {
    throw new Error(tipo === 'examenes'
      ? 'Escriba al menos un examen.'
      : tipo === 'diagnostico' ? 'Escriba o elija el diagnóstico.' : 'La nota está vacía.');
  }
  if (texto.length > LARGO_MAXIMO) {
    throw new Error(`Es demasiado largo: hasta ${LARGO_MAXIMO} caracteres.`);
  }

  /* El código CIE-10 solo si existe en el catálogo. Uno inventado se vería
     igual de oficial que uno de verdad; sin código, el diagnóstico queda
     escrito como lo escribió el médico, que también vale. */
  let codigo: string | null = null;
  const pedido = String(entrada.codigo ?? '').trim().toUpperCase();
  if (tipo === 'diagnostico' && pedido) {
    const [hay] = await bd
      .select({ codigo: esquema.diagnostico.codigo })
      .from(esquema.diagnostico)
      .where(eq(esquema.diagnostico.codigo, pedido))
      .limit(1);
    codigo = hay?.codigo ?? null;
  }

  const [nuevo] = await bd
    .insert(esquema.agregado)
    .values({ atencionId, tipo, texto, codigo, autorId: usuario.id })
    .returning({ id: esquema.agregado.id });

  await anotar(usuario.id, 'agrego', atencionId, { tipo, agregado: nuevo.id });
  return { id: nuevo.id, tipo };
}

/** Anula un agregado. Se queda guardado y tachado; deja de salir impreso. */
export async function anularAgregado(usuario: Usuario, agregadoId: string, motivo: string) {
  if (!puede(usuario.rol as string, 'anular_atencion')) {
    throw new Error('Solo administración anula lo que se le agregó a una atención.');
  }
  if (!esIdentificador(agregadoId)) throw new Error('Ese agregado no existe o ya estaba anulado.');
  const razon = String(motivo ?? '').trim();
  if (!razon) throw new Error('Escriba por qué se anula.');
  if (razon.length > 1000) throw new Error('El motivo es demasiado largo.');

  const [hecho] = await bd
    .update(esquema.agregado)
    .set({ anuladoPor: usuario.id, anuladoMotivo: razon, anuladoEn: new Date() })
    .where(and(eq(esquema.agregado.id, agregadoId), isNull(esquema.agregado.anuladoPor)))
    .returning({ id: esquema.agregado.id, atencionId: esquema.agregado.atencionId });
  if (!hecho) throw new Error('Ese agregado no existe o ya estaba anulado.');

  await anotar(usuario.id, 'anulo_agregado', hecho.atencionId, { agregado: hecho.id, motivo: razon });
  return hecho;
}

/**
 * Los exámenes que un médico indicó y recepción todavía no registró. Van
 * en la cola de recepción: si no, una indicación escrita en una consulta
 * vieja no la ve nadie.
 */
export async function indicacionesPendientes() {
  const autor = alias(esquema.user, 'autor');
  return bd
    .select({
      id: esquema.agregado.id,
      texto: esquema.agregado.texto,
      creado: esquema.agregado.creado,
      atencionId: esquema.agregado.atencionId,
      numero: esquema.atencion.numero,
      autor: autor.name,
      paciente: esquema.paciente.nombre,
      cedula: esquema.paciente.cedula,
      tipoDoc: esquema.paciente.tipoDoc,
    })
    .from(esquema.agregado)
    .innerJoin(esquema.atencion, eq(esquema.atencion.id, esquema.agregado.atencionId))
    .innerJoin(esquema.paciente, eq(esquema.paciente.id, esquema.atencion.pacienteId))
    .innerJoin(autor, eq(autor.id, esquema.agregado.autorId))
    .where(and(
      eq(esquema.agregado.tipo, 'examenes'),
      isNull(esquema.agregado.ordenId),
      isNull(esquema.agregado.anuladoPor),
      eq(esquema.atencion.estado, 'cerrada'),
    ))
    .orderBy(desc(esquema.agregado.creado));
}

/**
 * Una indicación todavía pendiente que se puede registrar como orden desde
 * esa consulta. Null si no calza: otro paciente, otra consulta, anulada o
 * ya registrada.
 */
export async function indicacionParaOrden(agregadoId: string, origenId: string) {
  if (!esIdentificador(agregadoId) || !esIdentificador(origenId)) return null;
  const [fila] = await bd
    .select({ id: esquema.agregado.id, texto: esquema.agregado.texto })
    .from(esquema.agregado)
    .where(and(
      eq(esquema.agregado.id, agregadoId),
      eq(esquema.agregado.atencionId, origenId),
      eq(esquema.agregado.tipo, 'examenes'),
      isNull(esquema.agregado.ordenId),
      isNull(esquema.agregado.anuladoPor),
    ))
    .limit(1);
  return fila ?? null;
}

/** Deja la indicación colgada de la orden que la registró. */
export async function vincularOrden(agregadoId: string, origenId: string, ordenId: string) {
  if (![agregadoId, origenId, ordenId].every(esIdentificador)) return false;
  const [orden] = await bd
    .select({ origenId: esquema.atencion.origenId })
    .from(esquema.atencion)
    .where(eq(esquema.atencion.id, ordenId))
    .limit(1);
  /* La orden tiene que haber salido de la misma consulta: si no, una
     indicación podría quedar «registrada» con la orden de otro paciente. */
  if (!orden || orden.origenId !== origenId) return false;

  const hecho = await bd
    .update(esquema.agregado)
    .set({ ordenId })
    .where(and(
      eq(esquema.agregado.id, agregadoId),
      eq(esquema.agregado.atencionId, origenId),
      eq(esquema.agregado.tipo, 'examenes'),
      isNull(esquema.agregado.ordenId),
    ))
    .returning({ id: esquema.agregado.id });
  return hecho.length > 0;
}
