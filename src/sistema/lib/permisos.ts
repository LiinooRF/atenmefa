/**
 * Quién puede hacer qué.
 *
 * Toda la aplicación pregunta acá. Si mañana el cliente decide otra cosa,
 * se cambia una línea de esta tabla y cambia en todas las pantallas; no hay
 * comprobaciones sueltas repartidas por el código.
 *
 * YA CONTESTADO POR EL CLIENTE
 *
 *   · son cuatro roles: «administrador, médico, bioanalista y
 *     recepcionista»;
 *   · el médico NO carga resultados NI registra órdenes, y el bioanalista
 *     NO escribe historias: «el médico va a poder hacer la atención y el
 *     bioanalista la del laboratorio». El médico lee lo que volvió y nada
 *     más; indicar los exámenes lo hace donde siempre, escribiéndolo en su
 *     historia;
 *   · los cuatro pueden LEER la historia clínica y descargarla, «si es que
 *     lo necesitan». Lo preguntamos y contestó que sí.
 *
 * LO QUE SIGUE SIN CONFIRMAR
 *
 *   1. ¿Un médico puede leer la historia de un paciente que atendió otro?
 *      Acá decimos que sí: en un centro donde se cubren entre ellos, negar
 *      la continuidad del historial es peor que el riesgo de que lo lea
 *      quien no lo atendió. Todo acceso queda en bitácora igual.
 *   2. ¿El médico puede tocar los precios? Acá decimos que no: el catálogo
 *      y el cobro son de administración.
 *   3. ¿Quién anula una atención cerrada? Acá decimos que solo
 *      administración, y siempre con motivo escrito.
 *   4. ¿Recepción ve el cierre del mes? Él dudó en voz alta —«no sé si él
 *      tenga que ver los precios»— y después dijo que recepción cobra. Acá
 *      cobra pero no ve el consolidado: cargar un renglón y ver cuánto
 *      facturó el centro en el mes son dos cosas distintas.
 */

export type Rol = 'medico' | 'administracion' | 'bioanalista' | 'recepcionista';

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
  | 'editar_paciente'      // corregir nombre y datos de contacto sin abrir atención
  | 'ver_laboratorio'      // leer una orden de laboratorio y sus resultados
  | 'cola_laboratorio'     // la pantalla con lo que el laboratorio tiene pendiente
  | 'registrar_laboratorio'// crear la orden: quién es y qué se le va a hacer
  | 'cargar_resultados'    // escribir los valores y firmarlos
  | 'enviar_documento'     // mandar el informe por WhatsApp o correo
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
    'enviar_documento',
    'cargar_cobro',
    'ver_pacientes',
    /* LEE el laboratorio y no lo toca. El médico indica los exámenes en su
       historia, como siempre; la orden la registra recepción y los
       resultados los carga el bioanalista. El cliente lo dijo así: «¿por
       qué el médico puede pedir o poner laboratorio? Por eso hay un
       bioanalista». Lo que sí necesita es ver lo que volvió, y eso le
       aparece colgado de su propia consulta y en la ficha del paciente. */
    'ver_laboratorio',
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
    'editar_paciente',
    'ver_marketing',
    'ver_laboratorio',
    'cola_laboratorio',
    'registrar_laboratorio',
    'enviar_documento',
  ],

  /**
   * El bioanalista —«el licenciado», como lo llama el cliente— carga los
   * resultados y los firma.
   *
   * No ESCRIBE historias clínicas: eso fue literal en el audio, «el médico
   * va a poder hacer la atención y el bioanalista la del laboratorio».
   * Leerlas sí, y descargarlas: el cliente lo pidió explícito para los
   * tres —médico, bioanalista y recepción—, «si es que lo necesitan». En un
   * centro chico el que carga un resultado raro necesita saber si la
   * paciente está embarazada o con tratamiento. Todo acceso queda en
   * bitácora.
   *
   * No cobra: quien cobra es recepción.
   */
  bioanalista: [
    'ver_casos',
    'ver_historia',
    'ver_laboratorio',
    'cola_laboratorio',
    'registrar_laboratorio',
    'cargar_resultados',
    'imprimir_documento',
    'enviar_documento',
    'ver_pacientes',
  ],

  /**
   * Recepción: «crear el paciente, actualizarlo, datos de contacto», la
   * lista de todos, qué exámenes se le van a hacer, y cobrar.
   *
   * Lee la historia clínica y la puede descargar. Lo preguntamos y el
   * cliente contestó que sí: los tres roles del centro la ven «si es que lo
   * necesitan». Es su centro y es su criterio; lo que queda de nuestro lado
   * es que cada apertura se anote en bitácora, y se anota.
   */
  recepcionista: [
    'ver_casos',
    'ver_historia',
    'ver_pacientes',
    'editar_paciente',
    'ver_laboratorio',
    'cola_laboratorio',
    'registrar_laboratorio',
    'cargar_cobro',
    'imprimir_documento',
    'enviar_documento',
  ],
};

/**
 * A dónde cae cada uno al entrar.
 *
 * El bioanalista y recepción caían en «Casos», que es la lista de
 * atenciones generales: para ellos está vacía y no es su trabajo. Su
 * pantalla es la cola del laboratorio, que es donde pasan el día.
 */
export const dondeEmpieza = (rol: string | null | undefined) =>
  puede(rol, 'cola_laboratorio') && !puede(rol, 'ver_cierre')
    ? '/sistema/laboratorio'
    : '/sistema';

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

const NOMBRES: Record<Rol, string> = {
  medico: 'Médico',
  administracion: 'Administración',
  bioanalista: 'Bioanalista',
  recepcionista: 'Recepción',
};

/**
 * Quién puede borrar un borrador.
 *
 * El dueño el suyo, y administración cualquiera. Lo pidió así el cliente:
 * «el médico empieza una y no la termina, en borradores la puede borrar,
 * igual que el bioanalista», y «el admin puede borrar borradores».
 *
 * Se apoya en 'anular_atencion' para el caso de administración en vez de
 * inventar un permiso nuevo: es el permiso que ya significa «puede deshacer
 * atenciones», y deshacer un borrador es la versión barata de eso. Lo
 * firmado sigue necesitando anularse con motivo escrito.
 */
export function puedeBorrarBorrador(
  usuario: { id: string; rol?: string | null } | null,
  atencion: { tipo: string; estado: string; medicoId: string },
): boolean {
  if (!usuario) return false;
  if (atencion.estado !== 'borrador') return false;
  if (puede(usuario.rol, 'anular_atencion')) return true;
  return atencion.tipo === 'laboratorio'
    ? puedeEditarOrden(usuario, atencion)
    : puedeEditarAtencion(usuario, atencion);
}

/**
 * Una orden de laboratorio abierta la corrige cualquiera de recepción.
 *
 * Misma razón que los resultados: la registra quien esté en el mesón y la
 * corrige quien esté después. Atarla a quien creó la fila dejaba una orden
 * con la cédula mal escrita imposible de arreglar en el turno siguiente.
 */
export function puedeEditarOrden(
  usuario: { rol?: string | null } | null,
  atencion: { tipo: string; estado: string },
): boolean {
  if (!usuario) return false;
  if (atencion.tipo !== 'laboratorio') return false;
  if (atencion.estado !== 'borrador') return false;
  return puede(usuario.rol, 'registrar_laboratorio');
}

/**
 * Los resultados no los termina «quien los abrió».
 *
 * A diferencia de la historia clínica, una orden de laboratorio la registra
 * una persona (recepción) y los resultados los carga otra (el bioanalista).
 * Atarlo a quien creó la fila dejaría la orden imposible de completar, que
 * es exactamente lo que pasaba al reusar puedeEditarAtencion acá.
 *
 * El turno de la mañana registra y el de la tarde resulta: cualquier
 * bioanalista puede cargar los de cualquier orden abierta. Quién lo hizo
 * queda en atencion.resultados_por y es la firma que va en el informe.
 */
export function puedeCargarResultados(
  usuario: { rol?: string | null } | null,
  atencion: { tipo: string; estado: string },
): boolean {
  if (!usuario) return false;
  if (!puede(usuario.rol, 'cargar_resultados')) return false;
  if (atencion.tipo !== 'laboratorio') return false;
  return atencion.estado === 'borrador';
}

export const nombreDelRol = (rol: string | null | undefined) =>
  NOMBRES[rol as Rol] ?? 'Sin rol';

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
  editar_paciente: 'Los datos del paciente los corrige recepción.',
  ver_laboratorio: 'Su usuario no puede abrir órdenes de laboratorio.',
  cola_laboratorio: 'La cola del laboratorio es del bioanalista y de recepción.',
  registrar_laboratorio: 'Su usuario no puede registrar órdenes de laboratorio.',
  cargar_resultados: 'Los resultados los carga y firma el bioanalista.',
  enviar_documento: 'Su usuario no puede enviar el informe al paciente.',
  ver_marketing: 'Las métricas del sitio son de administración.',
};
