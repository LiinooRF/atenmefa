/**
 * Cómo van los respaldos.
 *
 * El modo más común de quedarse sin respaldo no es no tener uno: es creer
 * que se está haciendo. El servicio se cae, el disco se llena, cambia la
 * clave de la base, y las copias dejan de hacerse en silencio. Nadie mira
 * los registros de un contenedor hasta el día que hay que restaurar, que es
 * el peor día para enterarse.
 *
 * Por eso el servicio de respaldos deja una fila por intento y esto la lee,
 * para que el panel pueda avisar en vez de esperar a que alguien pregunte.
 */
import { desc, eq } from 'drizzle-orm';
import { bd, esquema } from './base';

/** Más de esto sin un respaldo bueno y hay que mirar qué pasó. */
const HORAS_DE_GRACIA = 30;

export interface EstadoDelRespaldo {
  /** El último que se verificó bueno, si hay alguno. */
  ultimoBueno: { momento: Date; archivo: string | null; bytes: number | null } | null;
  /** El último intento, bueno o malo: puede ser más reciente que el bueno. */
  ultimoIntento: { momento: Date; estado: string; detalle: string | null } | null;
  /** Cuántas horas pasaron desde el último bueno. null si nunca hubo. */
  horas: number | null;
  /**
   * 'bien'    — hay copia reciente y verificada
   * 'viejo'   — la última buena ya tiene más de 30 horas
   * 'fallando'— el último intento falló. Vale tanto si hay una copia buena
   *             más atrás como si NUNCA hubo una: lo segundo es peor, y
   *             decir "no hay ningún respaldo" se leería como que falta
   *             configurarlo, cuando lo que pasa es que se está intentando
   *             y rompiendo.
   * 'nunca'   — no se intentó nunca
   */
  senal: 'bien' | 'viejo' | 'fallando' | 'nunca';
}

export async function estadoDelRespaldo(): Promise<EstadoDelRespaldo> {
  const [bueno] = await bd
    .select({
      momento: esquema.respaldo.momento,
      archivo: esquema.respaldo.archivo,
      bytes: esquema.respaldo.bytes,
    })
    .from(esquema.respaldo)
    .where(eq(esquema.respaldo.estado, 'ok'))
    .orderBy(desc(esquema.respaldo.momento))
    .limit(1);

  const [intento] = await bd
    .select({
      momento: esquema.respaldo.momento,
      estado: esquema.respaldo.estado,
      detalle: esquema.respaldo.detalle,
    })
    .from(esquema.respaldo)
    .orderBy(desc(esquema.respaldo.momento))
    .limit(1);

  const horas = bueno ? (Date.now() - bueno.momento.getTime()) / 3_600_000 : null;

  /* El orden importa. Un intento fallido manda aunque haya una copia buena
     de ayer: lo que hay que mirar es que algo se rompió, no que todavía
     queda una copia servible. */
  const senal: EstadoDelRespaldo['senal'] = intento?.estado === 'fallo'
    ? 'fallando'
    : !bueno
      ? 'nunca'
      : horas !== null && horas > HORAS_DE_GRACIA
        ? 'viejo'
        : 'bien';

  return { ultimoBueno: bueno ?? null, ultimoIntento: intento ?? null, horas, senal };
}

/** Cuánto hace, dicho como lo diría una persona. */
export function haceCuanto(horas: number): string {
  if (horas < 1) return 'hace menos de una hora';
  if (horas < 2) return 'hace una hora';
  if (horas < 24) return `hace ${Math.floor(horas)} horas`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'hace un día' : `hace ${dias} días`;
}

/** 1,4 MB y no 1468006 bytes. */
export function tamanio(bytes: number): string {
  const mb = bytes / 1_048_576;
  if (mb >= 1) return `${mb.toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
