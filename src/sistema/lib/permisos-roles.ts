/**
 * Los permisos de los roles de trabajo, configurables por administración.
 *
 * El negocio es familiar: la misma gente rota entre oficios. El paquete
 * base de cada rol vive en permisos.ts (TABLA) y no cambia; acá se guarda
 * lo que administración PRENDIÓ o APAGÓ respecto al paquete, en la tabla
 * rol_permiso (035). Sin fila vale el paquete.
 *
 * LAS REGLAS QUE ESTO NO TOCA
 *
 *  · Administración no aparece: sus permisos son fijos y no se prenden ni
 *    se apagan desde la pantalla.
 *  · La autoría no es un permiso: un borrador lo termina quien lo abrió y
 *    una corrección la hace quien firmó o administración (permisos.ts).
 *    Los interruptores dan la capacidad, no la autoría.
 *  · Lo que encienda el cliente queda en bitácora y los informes firmados
 *    quedan firmados por quien hizo el trabajo: si recepción carga
 *    resultados, su nombre es el que firma. La pantalla lo advierte al
 *    encenderlo.
 *
 * LA UI TRABAJA CON ESTOS DATOS: GRUPOS (por área de trabajo), los
 * permisos PRENDIBLES por rol y las DEPENDENCIAS. Ver ajustes.astro.
 */
import { and, eq } from 'drizzle-orm';
import { bd, esquema } from './base';
import { anotar } from './atenciones';
import { puede, TABLA, type Permiso, type Rol } from './permisos';
import { ponerCache } from './permisos-roles-cache';
import type { Usuario } from './auth';

const ROLES_TRABAJO: readonly Rol[] = ['medico', 'bioanalista', 'recepcionista'];

/** Los permisos que la pantalla NO ofrece para cada rol. Administración
    profunda —plata consolidada, cuentas, bitácora— y las cosas que no
    tienen sentido fuera de su rol. */
const NO_OFRECIDOS: Record<Rol, readonly Permiso[]> = {
  medico: ['derivaciones_recepcion', 'anular_atencion', 'editar_catalogo', 'ver_bitacora', 'administrar_usuarios', 'ver_cierre', 'exportar_cierre', 'ver_marketing'],
  bioanalista: ['abrir_consulta', 'pedir_interconsulta', 'gestionar_interconsultas', 'derivaciones_recepcion', 'anular_atencion', 'editar_catalogo', 'ver_bitacora', 'administrar_usuarios', 'ver_cierre', 'exportar_cierre', 'ver_marketing'],
  recepcionista: ['escribir_historia', 'cerrar_atencion', 'pedir_interconsulta', 'gestionar_interconsultas', 'editar_plantillas', 'cargar_resultados', 'anular_atencion', 'editar_catalogo', 'ver_bitacora', 'administrar_usuarios', 'ver_cierre', 'exportar_cierre', 'ver_marketing'],
};

/* Los GRUPOS de la pantalla. El orden es el del día a día: primero
   consultas, después derivaciones, laboratorio, pacientes y plata. */
export const GRUPOS: readonly { titulo: string; permisos: readonly Permiso[] }[] = [
  {
    titulo: 'Consultas',
    permisos: ['ver_casos', 'ver_historia', 'abrir_consulta', 'escribir_historia', 'cerrar_atencion', 'agregar_al_caso', 'imprimir_documento', 'enviar_documento'],
  },
  {
    titulo: 'Derivaciones',
    permisos: ['pedir_interconsulta', 'gestionar_interconsultas', 'derivaciones_recepcion'],
  },
  {
    titulo: 'Laboratorio',
    permisos: ['ver_laboratorio', 'cola_laboratorio', 'registrar_laboratorio', 'cargar_resultados', 'editar_plantillas'],
  },
  {
    titulo: 'Pacientes',
    permisos: ['ver_pacientes', 'editar_paciente'],
  },
  {
    titulo: 'Cobro',
    permisos: ['cargar_cobro'],
  },
];

/* Qué exige qué: para encender el segundo hace falta el primero encendido. */
const DEPENDENCIAS: readonly { para: Permiso; exige: Permiso; porque: string }[] = [
  { para: 'cerrar_atencion', exige: 'escribir_historia', porque: 'para cerrar una consulta hace falta poder escribirla' },
  { para: 'agregar_al_caso', exige: 'ver_historia', porque: 'para agregar al caso hace falta leerlo' },
  { para: 'cargar_resultados', exige: 'cola_laboratorio', porque: 'para cargar resultados hace falta ver la cola del laboratorio' },
  { para: 'registrar_laboratorio', exige: 'cola_laboratorio', porque: 'para registrar órdenes hace falta ver la cola del laboratorio' },
  { para: 'derivaciones_recepcion', exige: 'ver_casos', porque: 'para llevar derivaciones del mesón hace falta ver los casos' },
];

/** Cómo se lee cada permiso en la pantalla: lo que hace, en el idioma del
    centro. El comentario del tipo en permisos.ts es para el desarrollador;
    esto es para el cliente. */
export const ROTULO: Record<Permiso, string> = {
  ver_casos: 'Ver los casos',
  ver_historia: 'Leer la historia clínica',
  escribir_historia: 'Escribir historias y consultas',
  abrir_consulta: 'Admitir casos en el mesón',
  cerrar_atencion: 'Cerrar y firmar la atención',
  agregar_al_caso: 'Agregar notas a un caso cerrado',
  pedir_interconsulta: 'Derivar al paciente',
  gestionar_interconsultas: 'Llevar todas las derivaciones',
  derivaciones_recepcion: 'Llevar las derivaciones del mesón',
  anular_atencion: 'Anular atenciones cerradas',
  imprimir_documento: 'Imprimir informes',
  cargar_cobro: 'Cobrar (renglones del caso)',
  editar_catalogo: 'Cambiar servicios y precios',
  ver_cierre: 'Ver el cierre del mes',
  exportar_cierre: 'Exportar el cierre en Excel',
  ver_bitacora: 'Ver la bitácora de accesos',
  administrar_usuarios: 'Crear cuentas y cambiar roles',
  ver_pacientes: 'Ver el registro de pacientes',
  editar_paciente: 'Corregir datos de contacto',
  ver_laboratorio: 'Ver el laboratorio',
  cola_laboratorio: 'Ver la cola del laboratorio',
  registrar_laboratorio: 'Registrar órdenes de laboratorio',
  cargar_resultados: 'Cargar resultados y firmarlos',
  editar_plantillas: 'Editar valores de referencia',
  enviar_documento: 'Enviar informes por WhatsApp o correo',
  ver_marketing: 'Ver el marketing del sitio',
};

/** Advertencia de firma: qué dice la casilla al encenderse. Null = nada. */
export const ADVERTENCIA: Partial<Record<Permiso, string>> = {
  escribir_historia: 'los informes de consulta quedarán firmados por este rol',
  cargar_resultados: 'los resultados del laboratorio quedarán firmados por este rol',
};

/* ------------------------------------------------------------------
   Lectura y escritura de las desviaciones.
   ------------------------------------------------------------------ */

/* La caché. `puede()` es sincrónica y la llaman 45 lugares: hacerla async
   no es opción. Las desviaciones viven en la caché de
   permisos-roles-cache.ts —sin base, para no cerrar el círculo de
   imports—, se llenan al arrancar el servidor y se refrescan cada vez que
   alguien guarda desde Ajustes. */
async function desviaciones(): Promise<Map<string, boolean>> {
  const filas = await bd.select().from(esquema.rolPermiso);
  ponerCache(filas);
  return new Map(filas.map((f) => [`${f.rol}:${f.permiso}`, f.valor]));
}

/** ¿Está encendido el permiso para ese rol? Paquete base + desviación. */
export async function puedeConDesviaciones(rol: Rol, permiso: Permiso): Promise<boolean> {
  const des = await desviaciones();
  const puesta = des.get(`${rol}:${permiso}`);
  return puesta !== undefined ? puesta : puede(rol, permiso);
}

/** Todo el mapa para la pantalla: por rol, cada permiso ofrecido con su
    estado (base, extra-prendido, extra-apagado) y las advertencias. */
export interface CajaPermiso {
  permiso: Permiso;
  base: boolean;          // viene en el paquete del rol
  encendido: boolean;     // cómo queda hoy (base, o encendido por desviación)
  advertencia?: string;   // de firma, al encenderlo
  exige?: Permiso;        // dependencia: encender este exige aquel
  porqueExige?: string;
}

export async function panelPermisos(): Promise<{
  roles: { rol: Rol; cajas: readonly CajaPermiso[]; grupos: readonly { titulo: string; permisos: readonly CajaPermiso[] }[] }[];
  advertencias: readonly string[];
}> {
  const des = await desviaciones();
  const estado = (rol: Rol, permiso: Permiso): CajaPermiso => {
    const base = (TABLA[rol] as readonly Permiso[]).includes(permiso);
    const puesta = des.get(`${rol}:${permiso}`);
    const encendido = puesta !== undefined ? puesta : base;
    const dep = DEPENDENCIAS.find((d) => d.para === permiso);
    return {
      permiso,
      base,
      encendido,
      advertencia: encendido || base ? undefined : ADVERTENCIA[permiso],
      exige: dep?.exige,
      porqueExige: dep?.porque,
    };
  };
  const roles = ROLES_TRABAJO.map((rol) => {
    const ofrecidos = (rol: Rol) =>
      GRUPOS.flatMap((g) => g.permisos)
        .filter((p) => !NO_OFRECIDOS[rol].includes(p) || (TABLA[rol] as readonly Permiso[]).includes(p));
    const cajas = [...new Set(ofrecidos(rol))].map((p) => estado(rol, p));
    const grupos = GRUPOS.map((g) => ({
      titulo: g.titulo,
      permisos: cajas.filter((c) => g.permisos.includes(c.permiso)),
    })).filter((g) => g.permisos.length > 0);
    return { rol, cajas, grupos };
  });
  return { roles, advertencias: Object.values(ADVERTENCIA) as string[] };
}

/** Guarda las desviaciones que llegan del formulario. `prendidos` es el set
    completo de «rol:permiso» que el admin marcó encendidos; lo que no
    esté y sea ofrecido vale APAGADO respecto al paquete base. */
export async function guardarPermisosRoles(
  usuario: Usuario,
  prendidos: ReadonlySet<string>,
): Promise<{ encendidos: string[]; apagados: string[] }> {
  if (!puede(usuario.rol as string, 'administrar_usuarios')) {
    throw new Error('Los permisos de los roles los cambia administración.');
  }
  const des = await desviaciones();
  const encendidos: string[] = [];
  const apagados: string[] = [];
  for (const rol of ROLES_TRABAJO) {
    const ofrecidos = GRUPOS.flatMap((g) => g.permisos)
      .filter((p) => !NO_OFRECIDOS[rol].includes(p) || (TABLA[rol] as readonly Permiso[]).includes(p));
    for (const permiso of ofrecidos) {
      const llave = `${rol}:${permiso}`;
      const base = (TABLA[rol] as readonly Permiso[]).includes(permiso);
      const ahora = prendidos.has(llave);
      if (ahora === base) {
        // Volvió al paquete: la desviación se quita (si había).
        if (des.has(llave)) {
          const [rol2, permiso2] = llave.split(':');
          await bd.delete(esquema.rolPermiso)
            .where(and(eq(esquema.rolPermiso.rol, rol2), eq(esquema.rolPermiso.permiso, permiso2)));
          apagados.push(llave);
        }
        continue;
      }
      // Dependencias: no encender sin su requisito encendido en el estado
      // FINAL (paquete base, o lo que este mismo guardado encienda).
      const dep = DEPENDENCIAS.find((d) => d.para === permiso && ahora);
      if (dep) {
        const baseDep = (TABLA[rol] as readonly Permiso[]).includes(dep.exige);
        const prendidoDep = baseDep || prendidos.has(`${rol}:${dep.exige}`);
        if (!prendidoDep) continue;
      }
      await bd.insert(esquema.rolPermiso)
        .values({ rol, permiso, valor: ahora, cambiadoPor: usuario.id, cambiado: new Date() })
        .onConflictDoUpdate({
          target: [esquema.rolPermiso.rol, esquema.rolPermiso.permiso],
          set: { valor: ahora, cambiadoPor: usuario.id, cambiado: new Date() },
        });
      if (ahora) encendidos.push(llave); else apagados.push(llave);
    }
  }
  if (encendidos.length || apagados.length) {
    await desviaciones();   // refresca la caché que lee puede()
    await anotar(usuario.id, 'permisos_rol', undefined, { encendidos, apagados });
  }
  return { encendidos, apagados };
}
