/**
 * Buscar un diagnóstico en la CIE-10, y decidir cuáles salen primero.
 *
 * El cliente pidió dos cosas en la misma frase: la lista internacional
 * completa, y que «desde el panel» se puedan dejar arriba los más comunes.
 * Son dos preguntas distintas y acá están separadas: `buscar` contesta la
 * primera, `ordenDeSalida` la segunda.
 *
 * CÓMO SE ORDENA, Y POR QUÉ ASÍ
 *
 *   1. lo que administración marcó, en el orden que le puso;
 *   2. lo que este centro ya usó, del más usado al menos;
 *   3. lo que el catálogo marca como válido en consulta externa;
 *   4. el resto, alfabético.
 *
 * El punto 2 no lo pidió nadie y es la mitad del valor: el día que se
 * estrena esto, nadie marcó nada todavía, y una lista de doce mil renglones
 * en orden alfabético es tan inútil como no tenerla. Lo que el centro ya
 * escribió es un dato real y se acomoda solo.
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { bd, esquema } from './base';
import { normalizar } from './atenciones';

/** Cuántos se devuelven por búsqueda. Más que esto no se mira. */
export const CUANTOS = 25;

export interface Diagnostico {
  codigo: string;
  nombre: string;
  capitulo: string;
  consulta: boolean;
  sexo: string | null;
  frecuente: boolean;
  /** Cuántas veces lo usó este centro. */
  usos: number;
}

/**
 * Cuántas veces se usó cada código, de las atenciones que no se anularon.
 *
 * Se cuenta sobre datos->>'idx_codigo', que es donde el expediente guarda
 * el código elegido. Una atención anulada no cuenta: si se anuló, lo que
 * decía dejó de valer.
 */
const USOS = sql<number>`(
  SELECT COUNT(*) FROM atencion a
   WHERE a.datos ->> 'idx_codigo' = ${esquema.diagnostico.codigo}
     AND a.estado <> 'anulada'
)`;

const ordenDeSalida = [
  /* Los marcados primero, y entre ellos el orden que les puso
     administración. NULLS LAST porque un marcado sin número no puede
     empujar a los que sí lo tienen. */
  desc(esquema.diagnostico.frecuente),
  sql`${esquema.diagnostico.orden} ASC NULLS LAST`,
  desc(USOS),
  desc(esquema.diagnostico.consulta),
  /* A igualdad de todo lo anterior, primero el nombre más corto. No es un
     criterio clínico, es que la rúbrica general se llama más corto que la
     específica: buscando «infección urinaria», N39.0 «infección de vías
     urinarias, sitio no especificado» le gana a la del puerperio. */
  sql`length(${esquema.diagnostico.nombre}) ASC`,
  asc(esquema.diagnostico.nombre),
];

const columnas = {
  codigo: esquema.diagnostico.codigo,
  nombre: esquema.diagnostico.nombre,
  capitulo: esquema.diagnostico.capitulo,
  consulta: esquema.diagnostico.consulta,
  sexo: esquema.diagnostico.sexo,
  frecuente: esquema.diagnostico.frecuente,
  usos: USOS,
};

/**
 * Busca por código o por nombre, sin que importen las tildes ni las
 * mayúsculas.
 *
 * Con la búsqueda vacía devuelve la cabeza de la lista, que es justo lo que
 * hace falta al abrir el campo: los marcados y los que el centro ya usa.
 *
 * Cada palabra tiene que aparecer, en cualquier orden. «urinaria infeccion»
 * encuentra «Infección de vías urinarias», que es como de verdad se teclea
 * cuando uno no recuerda el nombre exacto.
 */
export async function buscar(
  texto: string,
  cuantos = CUANTOS,
): Promise<Diagnostico[]> {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean).slice(0, 6);

  const filtros = palabras.map((p) => {
    const como = `%${p.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    return sql`${esquema.diagnostico.busca} LIKE ${como}`;
  });

  const filas = await bd
    .select(columnas)
    .from(esquema.diagnostico)
    .where(filtros.length ? and(...filtros) : undefined)
    .orderBy(...ordenDeSalida)
    .limit(cuantos);

  return filas.map((f) => ({ ...f, usos: Number(f.usos) }));
}

/** Uno exacto, para confirmar que un código que llegó del formulario existe. */
export async function porCodigo(codigo: string): Promise<Diagnostico | null> {
  const limpio = String(codigo ?? '').trim().toUpperCase();
  if (!/^[A-Z]\d{2}(\.\d)?$/.test(limpio)) return null;

  const [fila] = await bd
    .select(columnas)
    .from(esquema.diagnostico)
    .where(eq(esquema.diagnostico.codigo, limpio))
    .limit(1);

  return fila ? { ...fila, usos: Number(fila.usos) } : null;
}

/** Los que administración dejó arriba, en su orden. */
export async function marcados(): Promise<Diagnostico[]> {
  const filas = await bd
    .select(columnas)
    .from(esquema.diagnostico)
    .where(eq(esquema.diagnostico.frecuente, true))
    .orderBy(sql`${esquema.diagnostico.orden} ASC NULLS LAST`, asc(esquema.diagnostico.nombre));
  return filas.map((f) => ({ ...f, usos: Number(f.usos) }));
}

/**
 * Marca o desmarca uno.
 *
 * El orden se asigna solo, al final de la lista: el cliente quiere decir
 * «este va arriba», no pelearse con números. Reordenar es aparte, y mueve
 * de a uno.
 */
export async function marcar(codigo: string, quien: string) {
  const d = await porCodigo(codigo);
  if (!d) throw new Error('Ese código no está en el catálogo.');
  if (d.frecuente) return d;

  const [ultimo] = await bd
    .select({ max: sql<number>`COALESCE(MAX(${esquema.diagnostico.orden}), 0)` })
    .from(esquema.diagnostico)
    .where(eq(esquema.diagnostico.frecuente, true));

  await bd
    .update(esquema.diagnostico)
    .set({
      frecuente: true,
      orden: Number(ultimo?.max ?? 0) + 1,
      marcadoPor: quien,
      marcadoEn: new Date(),
    })
    .where(eq(esquema.diagnostico.codigo, d.codigo));

  return { ...d, frecuente: true };
}

export async function desmarcar(codigo: string, quien: string) {
  const d = await porCodigo(codigo);
  if (!d) throw new Error('Ese código no está en el catálogo.');

  await bd
    .update(esquema.diagnostico)
    .set({ frecuente: false, orden: null, marcadoPor: quien, marcadoEn: new Date() })
    .where(eq(esquema.diagnostico.codigo, d.codigo));

  return { ...d, frecuente: false };
}

/**
 * Lo mueve un lugar arriba o abajo entre los marcados.
 *
 * Intercambia el número con el vecino en vez de renumerar la lista: así dos
 * personas moviendo cosas a la vez no se pisan la lista completa.
 */
export async function mover(codigo: string, hacia: 'arriba' | 'abajo') {
  const lista = await marcados();
  const i = lista.findIndex((d) => d.codigo === codigo);
  if (i < 0) return;

  const j = hacia === 'arriba' ? i - 1 : i + 1;
  if (j < 0 || j >= lista.length) return;

  /* La lista puede tener huecos o empates en `orden` —se marcó de a uno y
     alguien pudo desmarcar en el medio—, así que no se intercambian los
     números viejos: se les asigna la posición que ocupan ahora. */
  await bd.transaction(async (tx) => {
    await tx.update(esquema.diagnostico)
      .set({ orden: j + 1 })
      .where(eq(esquema.diagnostico.codigo, lista[i].codigo));
    await tx.update(esquema.diagnostico)
      .set({ orden: i + 1 })
      .where(eq(esquema.diagnostico.codigo, lista[j].codigo));
  });
}

/**
 * Los diagnósticos que el centro escribió y no están en el catálogo.
 *
 * Son los que se escribieron a mano sin elegir de la lista. No es un error
 * —el cliente pidió expresamente poder escribir— pero sí es la lista de
 * candidatos a marcar: si algo se escribió veinte veces a mano, es porque
 * falta encontrarle su código.
 */
export async function escritosAMano(limite = 30) {
  const filas = await bd.execute<{ texto: string; veces: number }>(sql`
    SELECT trim(a.datos ->> 'idx') AS texto, COUNT(*)::int AS veces
      FROM atencion a
     WHERE a.estado <> 'anulada'
       AND NULLIF(trim(a.datos ->> 'idx'), '') IS NOT NULL
       AND NULLIF(trim(a.datos ->> 'idx_codigo'), '') IS NULL
     GROUP BY 1
     ORDER BY veces DESC, texto ASC
     LIMIT ${limite}
  `);
  return filas.map((f) => ({ texto: f.texto, veces: Number(f.veces) }));
}
