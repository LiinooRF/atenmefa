/**
 * Quién puede hacer qué.
 *
 * Toda la aplicación pregunta acá. Si mañana el cliente decide otra cosa,
 * se cambia una línea de esta tabla y cambia en todas las pantallas; no hay
 * comprobaciones sueltas repartidas por el código.
 *
 * POR CONFIRMAR CON EL CLIENTE. Estas son las reglas que elegimos por
 * omisión para un centro chico. Las tres que más conviene preguntar:
 *
 *   1. ¿Un médico puede leer la historia de un paciente que atendió otro?
 *      Acá decimos que sí: en un centro donde se cubren entre ellos, negar
 *      la continuidad del historial es peor que el riesgo de que lo lea
 *      quien no lo atendió. Todo acceso queda en bitácora igual.
 *   2. ¿El médico puede tocar los precios? Acá decimos que no: el catálogo
 *      y el cobro son de administración.
 *   3. ¿Quién anula una atención cerrada? Acá decimos que solo
 *      administración, y siempre con motivo escrito.
 */

export type Rol = 'medico' | 'administracion';

export type Permiso =
  | 'ver_casos'            // entrar al panel y ver la lista
  | 'ver_historia'         // leer los campos clínicos de un caso
  | 'escribir_historia'    // crear y editar atenciones
  | 'cerrar_atencion'      // firmar y cerrar
  | 'anular_atencion'      // dejar sin efecto una cerrada, con motivo
  | 'imprimir_documento'   // el "2 en 1"
  | 'cargar_cobro'         // renglones de una atención
  | 'editar_catalogo'      // servicios y precios
  | 'ver_cierre'           // consolidado del mes
  | 'exportar_cierre'      // la descarga en Excel
  | 'ver_bitacora'         // quién vio o tocó qué
  | 'administrar_usuarios'  // crear cuentas, cambiar roles, dar de baja
  | 'ver_pacientes'        // el registro general de pacientes
  | 'ver_marketing';       // cómo va el tráfico del sitio público

const TABLA: Record<Rol, readonly Permiso[]> = {
  /**
   * El médico atiende, firma y anota qué se le hizo al paciente. Lo último
   * no es una concesión: quien sabe que además de la consulta se mandó una
   * hematología y vino el traumatólogo es quien estuvo ahí, y obligar a
   * que administración lo transcriba después es como se pierden renglones.
   *
   * Lo que no toca es la plata: ni los precios del catálogo, ni el cierre
   * del mes, ni la exportación.
   */
  medico: [
    'ver_casos',
    'ver_historia',
    'escribir_historia',
    'cerrar_atencion',
    'imprimir_documento',
    'cargar_cobro',
    'ver_pacientes',
  ],

  /**
   * Administración pone precio y factura. No escribe historias clínicas:
   * no es personal médico y firmar un diagnóstico no se delega por
   * comodidad. Sí puede leerlas y corregir los renglones del cobro, porque
   * para facturar necesita saber qué se hizo.
   */
  administracion: [
    'ver_casos',
    'ver_historia',
    'anular_atencion',
    'imprimir_documento',
    'cargar_cobro',
    'editar_catalogo',
    'ver_cierre',
    'exportar_cierre',
    'ver_bitacora',
    'administrar_usuarios',
    'ver_pacientes',
    'ver_marketing',
  ],
};

export function puede(rol: string | null | undefined, permiso: Permiso): boolean {
  if (!rol) return false;
  return (TABLA[rol as Rol] ?? []).includes(permiso);
}

/**
 * Un borrador lo termina quien lo abrió. Administración no escribe
 * historias, así que acá no hay excepción: si el médico que lo empezó no
 * está, la atención se cierra como quedó o se anula, pero nadie escribe
 * en nombre de otro.
 */
export function puedeEditarAtencion(
  usuario: { id: string; rol?: string | null } | null,
  atencion: { medicoId: string; estado: string },
): boolean {
  if (!usuario) return false;
  if (!puede(usuario.rol, 'escribir_historia')) return false;
  if (atencion.estado !== 'borrador') return false;
  return atencion.medicoId === usuario.id;
}

export const nombreDelRol = (rol: string | null | undefined) =>
  rol === 'administracion' ? 'Administración' : rol === 'medico' ? 'Médico' : 'Sin rol';

/** Para explicar al usuario por qué no puede, en vez de un 403 seco. */
export const porQueNo: Record<Permiso, string> = {
  ver_casos: 'Su usuario no tiene acceso al panel.',
  ver_historia: 'Su usuario no puede leer historias clínicas.',
  escribir_historia: 'Solo el personal médico escribe historias clínicas.',
  cerrar_atencion: 'Solo el personal médico cierra y firma una atención.',
  anular_atencion: 'Solo administración puede anular una atención cerrada.',
  imprimir_documento: 'Su usuario no puede imprimir el documento.',
  cargar_cobro: 'El cobro lo carga administración.',
  editar_catalogo: 'El catálogo de servicios lo maneja administración.',
  ver_cierre: 'El cierre del mes es de administración.',
  exportar_cierre: 'La exportación del cierre es de administración.',
  ver_bitacora: 'La bitácora de accesos es de administración.',
  administrar_usuarios: 'Las cuentas las maneja administración.',
  ver_pacientes: 'Su usuario no puede ver el registro de pacientes.',
  ver_marketing: 'Las métricas del sitio son de administración.',
};
