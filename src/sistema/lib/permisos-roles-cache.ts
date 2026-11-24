/**
 * La caché de desviaciones de permisos, sin base de datos.
 *
 * Existe para romper el círculo de imports: permisos.ts es importado por
 * TODO el sistema y no puede importar a la base; permisos-roles.ts (que
 * sí toca la tabla rol_permiso) le llena esta caché al arrancar y la
 * refresca cada vez que administración guarda desde Ajustes.
 *
 * Llenarla es parte del arranque del servidor: base.ts la llama justo
 * después de conectarse. Si la carga falla —base caída en el arranque—
 * vale el paquete base y el servidor no se tumba por eso.
 */
const vacio: ReadonlyMap<string, boolean> = new Map();
let cache: ReadonlyMap<string, boolean> = vacio;

export const cacheDeDesviaciones = () => cache;

export function ponerCache(filas: readonly { rol: string; permiso: string; valor: boolean }[]) {
  cache = new Map(filas.map((f) => [`${f.rol}:${f.permiso}`, f.valor]));
}
