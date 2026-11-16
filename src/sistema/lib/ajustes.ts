/**
 * Ajustes del centro: lo que cambia de un cliente a otro.
 *
 * El sistema corre igual para Atenmefa, para la demo y para el centro que
 * venga después, y no todos trabajan igual: uno tiene mesón y recepción
 * coordina todo, otro no. Eso no se decide en el código ni en el despliegue:
 * lo cambia administración en Administración → Ajustes del centro. Sin fila
 * en la tabla, vale lo de fábrica. Ver 029-derivaciones.sql.
 */
import { bd, esquema } from './base';
import { anotar } from './atenciones';
import { puede } from './permisos';
import type { Usuario } from './auth';

export const AJUSTES = {
  /* Si el médico puede mandar una derivación a recepción. Apagado, todas
     van directas y la casilla ni aparece. */
  recepcion_derivaciones: {
    rotulo: 'Las derivaciones pueden pasar por recepción',
    pista: 'Apagado, todas van directas: la interna al especialista, la externa a administración.',
    defecto: true,
  },
  /* Qué viene marcado en cada tipo. El médico lo cambia en cada caso. */
  recepcion_interna: {
    rotulo: 'Derivación a un especialista del centro: viene marcado «pasa por recepción»',
    pista: 'Para que recepción lo admita y cobre la consulta del especialista.',
    defecto: true,
  },
  recepcion_externa: {
    rotulo: 'Derivación a un especialista de afuera: viene marcado «pasa por recepción»',
    pista: 'Sin marcar, la lleva administración por WhatsApp.',
    defecto: false,
  },
  recepcion_traslado: {
    rotulo: 'Traslado a otro centro: viene marcado «pasa por recepción»',
    pista: 'Para que recepción coordine la ambulancia.',
    defecto: true,
  },
} as const;

export type ClaveAjuste = keyof typeof AJUSTES;
export type Ajustes = Record<ClaveAjuste, boolean>;

const esClave = (c: string): c is ClaveAjuste => c in AJUSTES;

/** Todos los ajustes como valen hoy. */
export async function ajustes(): Promise<Ajustes> {
  const filas = await bd.select().from(esquema.ajuste);
  const puestos = new Map(filas.map((f) => [f.clave, f.valor]));
  const fuera = {} as Ajustes;
  for (const clave of Object.keys(AJUSTES) as ClaveAjuste[]) {
    const v = puestos.get(clave);
    fuera[clave] = v === undefined ? AJUSTES[clave].defecto : v === 'si';
  }
  return fuera;
}

/** Los guarda todos de una vez, como vienen del formulario. */
export async function guardarAjustes(usuario: Usuario, marcados: ReadonlySet<string>) {
  if (!puede(usuario.rol as string, 'administrar_usuarios')) {
    throw new Error('Los ajustes del centro los cambia administración.');
  }
  const antes = await ajustes();
  const cambios: Record<string, boolean> = {};
  for (const clave of Object.keys(AJUSTES) as ClaveAjuste[]) {
    const ahora = marcados.has(clave);
    if (ahora === antes[clave]) continue;
    cambios[clave] = ahora;
    await bd.insert(esquema.ajuste)
      .values({ clave, valor: ahora ? 'si' : 'no', cambiadoPor: usuario.id, cambiado: new Date() })
      .onConflictDoUpdate({
        target: esquema.ajuste.clave,
        set: { valor: ahora ? 'si' : 'no', cambiadoPor: usuario.id, cambiado: new Date() },
      });
  }
  if (Object.keys(cambios).length) await anotar(usuario.id, 'ajustes', undefined, cambios);
  return Object.keys(cambios).filter(esClave);
}
