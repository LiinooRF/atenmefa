/**
 * Corregir una atención ya cerrada, dejando el rastro.
 *
 * «A veces se equivocan en la cédula… que quede en el mismo circuito de
 * atención para modificar esa consulta paso a paso y modificar la
 * información del paciente, dejando eso en el historial» (16-11).
 *
 * Reglas, que el cliente eligió:
 *   - la corrige quien la firmó o administración (permisos.puedeCorregir);
 *   - siempre con motivo, y se guarda cada campo antes y después;
 *   - si la cédula estaba mal, la atención pasa al paciente correcto. Si
 *     ese paciente no existe, se le corrige la cédula al que tenía —salvo
 *     que tenga otras atenciones, que con su cédula están bien: entonces se
 *     crea el paciente nuevo y la atención pasa a él—;
 *   - el informe impreso dice al pie que fue corregido.
 *
 * Lo que NO se corrige: la fecha (de ella sale el mes del cierre, y
 * cambiarla movería plata de un mes cerrado a otro), quién firmó, y los
 * exámenes pedidos de una orden (son lo que se cobró).
 */
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { bd, esquema } from './base';
import type { CambioDeCampo } from '../base/esquema';
import { historia } from '../historia';
import { laboratorio, type Resultado } from '../laboratorio';
import { esTipo, llaveDe, ROTULO, type TipoDocumento } from './documento';
import { pacienteDe } from './atenciones';
import { puedeCorregir } from './permisos';
import type { Usuario } from './auth';

/** Lo que el formulario manda pero no es un dato que se corrija. */
const NO_SE_CORRIGEN = new Set(['tipo_atencion', 'medico', 'fecha']);

const ROTULOS: Record<string, string> = {
  ...Object.fromEntries([...historia, ...laboratorio].flatMap((s) => s.campos.map((c) => [c.clave, c.rotulo]))),
  idx_codigo: 'Código del diagnóstico',
  tipo_doc: 'Tipo de documento',
};

const comoTexto = (v: unknown) => (v === undefined || v === null ? '' : String(v)).trim();

/** Campo por campo, lo que cambió. Un campo vaciado cuenta: «antes X, ahora nada». */
export function diferencias(antes: Record<string, unknown>, ahora: Record<string, unknown>): CambioDeCampo[] {
  const claves = [...new Set([...Object.keys(antes), ...Object.keys(ahora)])]
    .filter((k) => !NO_SE_CORRIGEN.has(k));
  // En el orden del formulario, no en el de las llaves del JSON.
  const orden = Object.keys(ROTULOS);
  claves.sort((a, b) => (orden.indexOf(a) + 1 || 999) - (orden.indexOf(b) + 1 || 999));
  return claves
    .map((k) => ({ campo: k, rotulo: ROTULOS[k] ?? k, antes: comoTexto(antes[k]), despues: comoTexto(ahora[k]) }))
    .filter((c) => c.antes !== c.despues);
}

/**
 * Los resultados se comparan por examen y, si un nombre se repite —los dos
 * «TIEMPO CONTROL» de la coagulación—, por cuál de ellos es.
 */
export function diferenciasDeResultados(antes: readonly Resultado[], ahora: readonly Resultado[]): CambioDeCampo[] {
  const llaves = (lista: readonly Resultado[]) => {
    const vistos = new Map<string, number>();
    return lista.map((r) => {
      const n = (vistos.get(r.examen) ?? 0) + 1;
      vistos.set(r.examen, n);
      return [`${r.examen}#${n}`, r] as const;
    });
  };
  const de = new Map(llaves(antes));
  const a = new Map(llaves(ahora));
  const texto = (r?: Resultado) => (r ? [r.valor, r.unidad].filter((x) => x?.trim()).join(' ').trim() : '');
  const cambios: CambioDeCampo[] = [];
  for (const k of new Set([...de.keys(), ...a.keys()])) {
    const r1 = de.get(k);
    const r2 = a.get(k);
    const rotulo = (r2 ?? r1)!.examen || '(sin nombre)';
    const t1 = r1 ? texto(r1) || '(sin resultado)' : '';
    const t2 = r2 ? texto(r2) || '(sin resultado)' : '';
    if (t1 !== t2 || (r1?.referencia ?? '') !== (r2?.referencia ?? '')) {
      cambios.push({ campo: `resultado:${k}`, rotulo, antes: r1 ? `${t1}${r1.referencia ? ` (ref. ${r1.referencia})` : ''}` : '', despues: r2 ? `${t2}${r2.referencia ? ` (ref. ${r2.referencia})` : ''}` : '' });
    }
  }
  return cambios;
}

const revisarMotivo = (m: unknown) => {
  const motivo = String(m ?? '').trim();
  if (motivo.length < 5) throw new Error('Escriba el motivo de la corrección: qué estaba mal.');
  return motivo.slice(0, 2000);
};

async function cerradaPara(atencionId: string) {
  const [a] = await bd
    .select({
      id: esquema.atencion.id, numero: esquema.atencion.numero, tipo: esquema.atencion.tipo,
      estado: esquema.atencion.estado, medicoId: esquema.atencion.medicoId,
      resultadosPor: esquema.atencion.resultadosPor, pacienteId: esquema.atencion.pacienteId,
      fecha: esquema.atencion.fecha, datos: esquema.atencion.datos, resultados: esquema.atencion.resultados,
      tipoDoc: esquema.paciente.tipoDoc,
    })
    .from(esquema.atencion)
    .innerJoin(esquema.paciente, eq(esquema.paciente.id, esquema.atencion.pacienteId))
    .where(eq(esquema.atencion.id, atencionId))
    .limit(1);
  return a ?? null;
}

/**
 * Corrige los datos de una atención cerrada: la historia de una consulta,
 * o el registro de una orden. Devuelve lo que cambió.
 */
export async function corregirAtencion(
  usuario: Usuario, atencionId: string, nuevos: Record<string, string>, motivoCrudo: unknown,
) {
  const caso = await cerradaPara(atencionId);
  if (!caso || !puedeCorregir(usuario, caso)) throw new Error('Esta atención no la puede corregir usted.');
  const motivo = revisarMotivo(motivoCrudo);
  const antes = (caso.datos ?? {}) as Record<string, string>;

  /* Lo que no se corrige se queda como estaba, llegue lo que llegue. */
  const datos: Record<string, string> = { ...nuevos, fecha: antes.fecha ?? caso.fecha };
  if (antes.medico) datos.medico = antes.medico; else delete datos.medico;
  if (antes.tipo_atencion) datos.tipo_atencion = antes.tipo_atencion;
  if (!datos.tipo_doc) datos.tipo_doc = antes.tipo_doc ?? caso.tipoDoc;
  if (!datos.cedula || !datos.nombre) throw new Error('El nombre y la cédula del paciente no pueden quedar vacíos.');

  const cambios = diferencias(antes, datos);
  if (cambios.length === 0) throw new Error('No cambió nada: no hay qué corregir.');

  /* El paciente. Solo si cambió el documento. */
  const tipo: TipoDocumento = esTipo(datos.tipo_doc) ? datos.tipo_doc : 'cedula';
  const llave = llaveDe(tipo, datos.cedula);
  if (!llave) throw new Error(`Falta el ${ROTULO[tipo].toLowerCase()} del paciente.`);
  const [actual] = await bd.select().from(esquema.paciente).where(eq(esquema.paciente.id, caso.pacienteId)).limit(1);
  if (actual && actual.cedulaBusca !== llave) {
    const [otro] = await bd.select({ id: esquema.paciente.id }).from(esquema.paciente)
      .where(eq(esquema.paciente.cedulaBusca, llave)).limit(1);
    if (!otro) {
      const [{ n }] = await bd.select({ n: sql<number>`count(*)::int` }).from(esquema.atencion)
        .where(and(eq(esquema.atencion.pacienteId, caso.pacienteId), ne(esquema.atencion.id, caso.id)));
      /* Solo esta atención: la cédula del paciente estaba mal, se corrige
         ahí. Con otras atenciones, esas están bien con su cédula: el
         paciente nuevo lo crea pacienteDe, abajo. */
      if (n === 0) {
        await bd.update(esquema.paciente)
          .set({ cedula: datos.cedula, cedulaBusca: llave, tipoDoc: tipo })
          .where(eq(esquema.paciente.id, caso.pacienteId));
      }
    }
  }
  const paciente = await pacienteDe(datos);

  const [hecha] = await bd.update(esquema.atencion)
    .set({
      pacienteId: paciente.id,
      aseguradora: datos.aseguradora ?? null,
      poliza: datos.poliza ?? null,
      casoNumero: datos.caso_numero ?? null,
      datos,
    })
    .where(and(eq(esquema.atencion.id, caso.id), eq(esquema.atencion.estado, 'cerrada')))
    .returning({ id: esquema.atencion.id });
  if (!hecha) throw new Error('La atención cambió de estado mientras se corregía. Vuelva a abrirla.');

  await bd.insert(esquema.correccion).values({
    atencionId: caso.id,
    autorId: usuario.id,
    motivo,
    cambios,
    pacienteAntes: paciente.id !== caso.pacienteId ? caso.pacienteId : null,
    pacienteDespues: paciente.id !== caso.pacienteId ? paciente.id : null,
  });
  return { numero: caso.numero, cambios, cambioDePaciente: paciente.id !== caso.pacienteId };
}

/** Corrige los resultados de una orden ya entregada. */
export async function corregirResultados(
  usuario: Usuario, atencionId: string, nuevos: readonly Resultado[], motivoCrudo: unknown,
) {
  const caso = await cerradaPara(atencionId);
  if (!caso || caso.tipo !== 'laboratorio' || !puedeCorregir(usuario, caso)) {
    throw new Error('Estos resultados no los puede corregir usted.');
  }
  const motivo = revisarMotivo(motivoCrudo);
  if (!nuevos.some((r) => r.valor)) throw new Error('Los resultados no pueden quedar todos vacíos.');
  const cambios = diferenciasDeResultados((caso.resultados ?? []) as Resultado[], nuevos);
  if (cambios.length === 0) throw new Error('No cambió nada: no hay qué corregir.');

  const [hecha] = await bd.update(esquema.atencion)
    .set({ resultados: [...nuevos] })
    .where(and(eq(esquema.atencion.id, caso.id), eq(esquema.atencion.estado, 'cerrada')))
    .returning({ id: esquema.atencion.id });
  if (!hecha) throw new Error('La orden cambió de estado mientras se corregía. Vuelva a abrirla.');

  await bd.insert(esquema.correccion).values({ atencionId: caso.id, autorId: usuario.id, motivo, cambios });
  return { numero: caso.numero, cambios };
}

/** Las correcciones de una atención, de la primera a la última, con su autor. */
export async function correccionesDe(atencionId: string) {
  return bd
    .select({
      id: esquema.correccion.id,
      motivo: esquema.correccion.motivo,
      cambios: esquema.correccion.cambios,
      creado: esquema.correccion.creado,
      autor: esquema.user.name,
      cambioDePaciente: sql<boolean>`${esquema.correccion.pacienteDespues} is not null`,
    })
    .from(esquema.correccion)
    .innerJoin(esquema.user, eq(esquema.user.id, esquema.correccion.autorId))
    .where(eq(esquema.correccion.atencionId, atencionId))
    .orderBy(asc(esquema.correccion.creado));
}
