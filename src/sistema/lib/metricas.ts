/**
 * Números del tablero de administración.
 *
 * Todo se calcula en Postgres y no en memoria: son consultas que crecen
 * con los años de historial y traerlas enteras al servidor para sumarlas
 * acá se cae solo cuando el centro lleve dos años andando.
 *
 * Las atenciones anuladas quedan fuera de todo: quedaron sin efecto.
 */
import { sql } from 'drizzle-orm';
import { bd } from './base';

export interface Metricas {
  desde: string;
  hasta: string;
  dias: number;
  casos: number;
  casosAntes: number;
  pacientes: number;
  pacientesNuevos: number;
  borradores: number;
  cobrado: number;
  sinCobro: number;
  porPagador: { cobrarA: string; casos: number; total: number }[];
  porDia: { dia: string; casos: number }[];
  diagnosticos: { idx: string; veces: number }[];
  porMedico: { medico: string; casos: number }[];
  serviciosMasCargados: { descripcion: string; veces: number; total: number }[];
  /** Lo que más pide el laboratorio, que no es lo mismo que lo que más se cobra. */
  examenesMasPedidos: { examen: string; veces: number }[];
  /**
   * Cuánto tarda una orden desde que se toma la muestra hasta que se
   * firman los resultados. Es el número que un paciente pregunta en el
   * mesón y que nadie sabía responder con un dato.
   */
  entrega: { ordenes: number; horasPromedio: number | null; horasMediana: number | null };
}

/**
 * Las fechas llegan como YYYY-MM-DD, ambas incluidas.
 *
 * La comparación es contra el tramo inmediatamente anterior del mismo
 * largo: comparar una semana contra un mes no dice nada.
 */
export async function metricas(desde: string, hasta: string): Promise<Metricas> {
  const dias = Math.max(
    1,
    Math.round(
      (new Date(`${hasta}T12:00:00`).getTime() - new Date(`${desde}T12:00:00`).getTime())
        / 86_400_000,
    ) + 1,
  );

  const [resumen] = await bd.execute<{
    casos: number; pacientes: number; borradores: number;
    cobrado: string; sin_cobro: number; nuevos: number;
  }>(sql`
    WITH delMes AS (
      SELECT a.id, a.paciente_id
        FROM atencion a
       WHERE a.estado = 'cerrada'
         AND a.fecha BETWEEN ${desde}::date AND ${hasta}::date
    )
    SELECT
      (SELECT count(*)::int FROM delMes) AS casos,
      (SELECT count(DISTINCT paciente_id)::int FROM delMes) AS pacientes,
      (SELECT count(*)::int FROM atencion WHERE estado = 'borrador') AS borradores,
      (SELECT COALESCE(SUM(r.precio * r.cantidad), 0)
         FROM renglon r WHERE r.atencion_id IN (SELECT id FROM delMes)) AS cobrado,
      (SELECT count(*)::int FROM delMes d
        WHERE NOT EXISTS (SELECT 1 FROM renglon r WHERE r.atencion_id = d.id)) AS sin_cobro,
      (SELECT count(*)::int FROM paciente p
        WHERE (p.creado AT TIME ZONE 'America/Caracas')::date
              BETWEEN ${desde}::date AND ${hasta}::date) AS nuevos
  `);

  /* El tramo anterior del mismo largo, pegado al que se está mirando. */
  const [antes] = await bd.execute<{ casos: number }>(sql`
    SELECT count(*)::int AS casos FROM atencion
     WHERE estado = 'cerrada'
       AND fecha BETWEEN (${desde}::date - ${dias} * interval '1 day')::date
                     AND (${desde}::date - interval '1 day')::date
  `);

  const porPagador = await bd.execute<{ cobrar_a: string; casos: number; total: string }>(sql`
    SELECT COALESCE(a.aseguradora, 'Pacientes directos') AS cobrar_a,
           count(DISTINCT a.id)::int AS casos,
           COALESCE(SUM(r.precio * r.cantidad), 0) AS total
      FROM atencion a
      LEFT JOIN renglon r ON r.atencion_id = a.id
     WHERE a.estado = 'cerrada'
       AND a.fecha BETWEEN ${desde}::date AND ${hasta}::date
     GROUP BY COALESCE(a.aseguradora, 'Pacientes directos')
     ORDER BY total DESC, casos DESC
  `);

  /* Una fila por día del mes, con cero donde no hubo nadie: un gráfico con
     días faltantes miente sobre el ritmo del centro. */
  const porDia = await bd.execute<{ dia: string; casos: number }>(sql`
    SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia,
           COALESCE(count(a.id), 0)::int AS casos
      FROM generate_series(${desde}::date, ${hasta}::date, interval '1 day') AS d(dia)
      LEFT JOIN atencion a ON a.fecha = d.dia::date AND a.estado = 'cerrada'
     GROUP BY d.dia
     ORDER BY d.dia
  `);

  const diagnosticos = await bd.execute<{ idx: string; veces: number }>(sql`
    SELECT a.datos ->> 'idx' AS idx, count(*)::int AS veces
      FROM atencion a
     WHERE a.estado = 'cerrada'
       AND a.fecha BETWEEN ${desde}::date AND ${hasta}::date
       AND NULLIF(trim(a.datos ->> 'idx'), '') IS NOT NULL
     GROUP BY a.datos ->> 'idx'
     ORDER BY veces DESC, idx
     LIMIT 8
  `);

  /* Solo las consultas. En una orden de laboratorio el `medico_id` es
     quien la REGISTRÓ —casi siempre recepción— y el panel terminaba
     diciendo que recepción atendió dos pacientes. */
  const porMedico = await bd.execute<{ medico: string; casos: number }>(sql`
    SELECT u.name AS medico, count(*)::int AS casos
      FROM atencion a JOIN "user" u ON u.id = a.medico_id
     WHERE a.estado = 'cerrada'
       AND a.tipo = 'general'
       AND a.fecha BETWEEN ${desde}::date AND ${hasta}::date
     GROUP BY u.name ORDER BY casos DESC
  `);

  const servicios = await bd.execute<{ descripcion: string; veces: number; total: string }>(sql`
    SELECT r.descripcion, count(*)::int AS veces, SUM(r.precio * r.cantidad) AS total
      FROM renglon r JOIN atencion a ON a.id = r.atencion_id
     WHERE a.estado = 'cerrada'
       AND a.fecha BETWEEN ${desde}::date AND ${hasta}::date
     GROUP BY r.descripcion ORDER BY total DESC LIMIT 8
  `);

  /* Lo que más se pide en el laboratorio. Sale de los resultados
     guardados y no de los renglones de cobro: un perfil se cobra como
     cinco renglones pero se pide como uno, y lo que el laboratorio
     necesita saber es qué analito corre más veces por el equipo. */
  const examenesMasPedidos = (await bd.execute(sql`
    SELECT r->>'examen' AS examen, COUNT(*)::int AS veces
      FROM atencion a, jsonb_array_elements(a.resultados) r
     WHERE a.tipo = 'laboratorio'
       AND a.fecha BETWEEN ${desde} AND ${hasta}
       AND COALESCE(btrim(r->>'valor'), '') <> ''
     GROUP BY 1
     ORDER BY veces DESC
     LIMIT 8`)) as unknown as { examen: string; veces: number }[];

  /* Cuánto tarda un resultado. La mediana además del promedio: una sola
     orden que quedó tres semanas abierta corre el promedio y hace creer
     que el laboratorio es lento cuando no lo es. */
  const [tiempos] = (await bd.execute(sql`
    SELECT COUNT(*)::int AS ordenes,
           ROUND(AVG(EXTRACT(EPOCH FROM (a.resultados_en - a.creada)) / 3600)::numeric, 1) AS promedio,
           ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (
             ORDER BY EXTRACT(EPOCH FROM (a.resultados_en - a.creada)) / 3600))::numeric, 1) AS mediana
      FROM atencion a
     WHERE a.tipo = 'laboratorio'
       AND a.resultados_en IS NOT NULL
       AND a.fecha BETWEEN ${desde} AND ${hasta}`)) as unknown as
    { ordenes: number; promedio: string | null; mediana: string | null }[];

  const entrega = {
    ordenes: Number(tiempos?.ordenes ?? 0),
    horasPromedio: tiempos?.promedio != null ? Number(tiempos.promedio) : null,
    horasMediana: tiempos?.mediana != null ? Number(tiempos.mediana) : null,
  };

  return {
    desde, hasta, dias,
    casos: resumen?.casos ?? 0,
    casosAntes: antes?.casos ?? 0,
    pacientes: resumen?.pacientes ?? 0,
    pacientesNuevos: resumen?.nuevos ?? 0,
    borradores: resumen?.borradores ?? 0,
    cobrado: Number(resumen?.cobrado ?? 0),
    sinCobro: resumen?.sin_cobro ?? 0,
    porPagador: porPagador.map((f) => ({
      cobrarA: f.cobrar_a, casos: f.casos, total: Number(f.total),
    })),
    porDia: porDia.map((f) => ({ dia: f.dia, casos: f.casos })),
    diagnosticos: diagnosticos.map((f) => ({ idx: f.idx, veces: f.veces })),
    porMedico: porMedico.map((f) => ({ medico: f.medico, casos: f.casos })),
    serviciosMasCargados: servicios.map((f) => ({
      descripcion: f.descripcion, veces: f.veces, total: Number(f.total),
    })),
    examenesMasPedidos: examenesMasPedidos.map((f) => ({
      examen: f.examen, veces: Number(f.veces),
    })),
    entrega,
  };
}
