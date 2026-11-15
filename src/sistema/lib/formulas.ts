/**
 * Las fórmulas del laboratorio con los números que puso el laboratorio.
 *
 * La forma de cada cuenta vive en sistema/calculos.ts y no se toca desde
 * una pantalla. Lo que sí se ajusta es el número que depende del reactivo:
 * el ISI del INR, la constante de la actividad, el divisor del VLDL. Ver
 * 027-formulas.sql.
 */
import { eq } from 'drizzle-orm';
import { bd, esquema } from './base';
import { anotar } from './atenciones';
import { montoDe } from './cobro';
import { puede } from './permisos';
import { CALCULOS, conValor, valorAjustable, type Calculo } from '../calculos';
import type { Usuario } from './auth';

/** Las cuentas como valen hoy: con lo que puso el laboratorio, o las de fábrica. */
export async function calculosVigentes(): Promise<Calculo[]> {
  const filas = await bd.select().from(esquema.formulaConstante);
  const puestos = new Map(filas.map((f) => [f.clave, Number(f.valor)]));
  return CALCULOS.map((c) => {
    const n = c.ajustable ? puestos.get(c.ajustable.clave) : undefined;
    return n === undefined || !Number.isFinite(n) ? c : conValor(c, n);
  });
}

/** Quién cambió cada número y cuándo, para la pantalla. */
export async function cambiosDeConstantes() {
  const filas = await bd
    .select({
      clave: esquema.formulaConstante.clave,
      cambiado: esquema.formulaConstante.cambiado,
      quien: esquema.user.name,
    })
    .from(esquema.formulaConstante)
    .innerJoin(esquema.user, eq(esquema.user.id, esquema.formulaConstante.cambiadoPor));
  return new Map(filas.map((f) => [f.clave, f]));
}

/**
 * Cambia un número ajustable. Lanza con el motivo.
 *
 * Con límites: un ISI de 117 por una coma perdida haría que todos los INR
 * salieran disparados, y es justo el error que nadie revisa porque «lo
 * calcula el sistema».
 */
export async function cambiarConstante(usuario: Usuario, clave: string, crudo: unknown) {
  if (!puede(usuario.rol as string, 'editar_plantillas')) {
    throw new Error('Las fórmulas las ajusta el laboratorio.');
  }
  const calculo = CALCULOS.find((c) => c.ajustable?.clave === clave);
  if (!calculo?.ajustable) throw new Error('Ese número no se puede ajustar.');
  const { min, max, rotulo } = calculo.ajustable;

  const n = montoDe(String(crudo ?? '').trim());
  if (n === null || !Number.isFinite(n)) throw new Error(`${rotulo}: escriba un número, por ejemplo 1,17.`);
  if (n < min || n > max) {
    throw new Error(`${rotulo}: tiene que estar entre ${String(min).replace('.', ',')} y ${String(max).replace('.', ',')}.`);
  }

  const vigentes = await calculosVigentes();
  const antes = valorAjustable(vigentes.find((c) => c.resultado === calculo.resultado)!);

  await bd.insert(esquema.formulaConstante)
    .values({ clave, valor: n.toFixed(4), cambiadoPor: usuario.id, cambiado: new Date() })
    .onConflictDoUpdate({
      target: esquema.formulaConstante.clave,
      set: { valor: n.toFixed(4), cambiadoPor: usuario.id, cambiado: new Date() },
    });

  await anotar(usuario.id, 'formula', undefined, { analito: calculo.resultado, clave, antes, despues: n });
  return { analito: calculo.resultado, antes, despues: n };
}
