/**
 * Modelo de la historia de atención.
 *
 * Sale del formulario en papel que usa hoy la clínica, recortado como pidió
 * el cliente: fuera los campos de estado del servicio que pertenecen a la red
 * de asistencia (proveedor, unidad asignada, clínica afiliada, médico que
 * recibe), que no son datos clínicos sino de despacho ajeno.
 *
 * De este modelo salen tres cosas, y por eso vive aparte de la pantalla:
 *   1. el formulario que llena el médico en la tablet,
 *   2. el documento imprimible de dos páginas (informe + récipe),
 *   3. las columnas de la base y el consolidado del mes.
 *
 * Regla: ningún campo clínico se inventa ni se autocompleta. Si el médico no
 * lo escribió, va vacío en el documento.
 */

export type TipoCampo =
  | 'texto'
  | 'parrafo'
  | 'numero'
  | 'fecha'
  | 'hora'
  | 'opcion'
  | 'si-no'
  | 'cedula'
  | 'telefono'
  | 'correo'
  /* Buscador del catálogo CIE-10 que además deja escribir a mano. Guarda
     dos valores: el nombre en su clave y el código en `<clave>_codigo`. */
  | 'diagnostico';

export interface Campo {
  clave: string;
  rotulo: string;
  tipo: TipoCampo;
  /** Obligatorio para poder cerrar la atención. */
  exigido?: boolean;
  opciones?: readonly string[];
  /** Unidad que se muestra pegada al campo (mmHg, lpm, °C…). */
  unidad?: string;
  /** Ayuda corta bajo el campo. */
  pista?: string;
  /** Ancho relativo dentro de su fila, de 1 a 4. */
  ancho?: 1 | 2 | 3 | 4;
}

export interface Seccion {
  clave: string;
  titulo: string;
  /** Se puede plegar en la tablet para no scrollear de más. */
  plegable?: boolean;
  campos: readonly Campo[];
}

/* El paciente va primero a propósito: la cédula es lo que dispara el
   relleno de lo que el sistema ya sabe, y el guardado automático no puede
   empezar hasta tener a quién colgarle la atención. */
export const historia: readonly Seccion[] = [
  {
    clave: 'paciente',
    titulo: 'Paciente',
    campos: [
      { clave: 'nombre', rotulo: 'Nombres y apellidos', tipo: 'texto', exigido: true, ancho: 4 },
      /* "o documento" porque no todo el mundo trae cédula: un extranjero con
         pasaporte, un recién nacido con su partida, o alguien que llegó sin
         nada y lleva el número que le puso el centro. El rótulo tiene que
         servir para los cuatro casos, acá y en el papel que se imprime. */
      { clave: 'cedula', rotulo: 'Cédula o documento', tipo: 'cedula', exigido: true, ancho: 2,
        pista: 'La cédula con su letra: V, E, J o G.' },
      { clave: 'edad', rotulo: 'Edad', tipo: 'numero', exigido: true, unidad: 'años', ancho: 1 },
      { clave: 'sexo', rotulo: 'Sexo', tipo: 'opcion', opciones: ['Femenino', 'Masculino'], exigido: true, ancho: 1 },
      { clave: 'telefono', rotulo: 'Teléfono', tipo: 'telefono', ancho: 2 },
      /* Los dos son para poder mandarle el documento después. Ninguno es
         obligatorio: hay pacientes que no tienen correo y hay que poder
         atenderlos igual. */
      { clave: 'whatsapp', rotulo: 'WhatsApp', tipo: 'telefono', ancho: 2,
        pista: 'Solo si es otro número.' },
      { clave: 'correo', rotulo: 'Correo', tipo: 'correo', ancho: 2 },
      { clave: 'titular', rotulo: 'Titular de la póliza', tipo: 'texto', ancho: 2,
        pista: 'Solo si es distinto del paciente.' },
      { clave: 'lugar', rotulo: 'Lugar de atención', tipo: 'opcion',
        opciones: ['En el local', 'Hogar', 'Trabajo', 'Otro'], exigido: true, ancho: 2 },
      { clave: 'direccion', rotulo: 'Dirección', tipo: 'texto', ancho: 4 },
      { clave: 'ciudad', rotulo: 'Ciudad', tipo: 'texto', ancho: 2 },
      { clave: 'referencia', rotulo: 'Punto de referencia', tipo: 'texto', ancho: 2,
        pista: 'Lo que de verdad sirve para llegar.' },
    ],
  },
  {
    clave: 'caso',
    titulo: 'El caso',
    campos: [
      { clave: 'fecha', rotulo: 'Fecha', tipo: 'fecha', exigido: true, ancho: 1 },
      { clave: 'hora_inicio', rotulo: 'Hora de inicio', tipo: 'hora', exigido: true, ancho: 1 },
      { clave: 'aseguradora', rotulo: 'Seguro o red', tipo: 'texto', ancho: 2,
        pista: 'Quién cubre el caso. Vacío si el paciente paga directo.' },
      { clave: 'poliza', rotulo: 'N° de póliza', tipo: 'texto', ancho: 1 },
      { clave: 'caso_numero', rotulo: 'N° de caso', tipo: 'texto', ancho: 1,
        pista: 'El que asigna el seguro, si lo hay. El correlativo interno lo pone el sistema.' },
      { clave: 'empresa', rotulo: 'Empresa', tipo: 'texto', ancho: 2 },
    ],
  },
  {
    clave: 'antecedentes',
    titulo: 'Hábitos y antecedentes',
    plegable: true,
    campos: [
      { clave: 'tabaco', rotulo: 'Tabáquicos', tipo: 'texto', ancho: 1 },
      { clave: 'alcohol', rotulo: 'Bebidas alcohólicas', tipo: 'texto', ancho: 1 },
      { clave: 'alergias', rotulo: 'Alergias', tipo: 'texto', ancho: 2,
        pista: 'Si no refiere, escribir "Ninguna". Nunca dejarlo en blanco.' },
      { clave: 'medicacion', rotulo: 'Medicación actual', tipo: 'texto', ancho: 2 },
      { clave: 'quirurgicos', rotulo: 'Intervenciones quirúrgicas', tipo: 'texto', ancho: 2 },
      { clave: 'antecedentes_medicos', rotulo: 'Antecedentes médicos', tipo: 'parrafo', ancho: 4 },
    ],
  },
  {
    clave: 'evaluacion',
    titulo: 'Evaluación',
    campos: [
      { clave: 'motivo', rotulo: 'Motivo de consulta', tipo: 'texto', exigido: true, ancho: 4 },
      { clave: 'enfermedad_actual', rotulo: 'Enfermedad actual', tipo: 'parrafo', exigido: true, ancho: 4 },
    ],
  },
  {
    clave: 'signos',
    titulo: 'Signos vitales',
    campos: [
      { clave: 'hora_signos', rotulo: 'Hora', tipo: 'hora', ancho: 1 },
      { clave: 'ta', rotulo: 'Tensión arterial', tipo: 'texto', unidad: 'mmHg', ancho: 1, pista: '120/80' },
      { clave: 'fc', rotulo: 'Frecuencia cardíaca', tipo: 'numero', unidad: 'lpm', ancho: 1 },
      { clave: 'fr', rotulo: 'Frecuencia respiratoria', tipo: 'numero', unidad: 'rpm', ancho: 1 },
      { clave: 'temperatura', rotulo: 'Temperatura', tipo: 'numero', unidad: '°C', ancho: 1 },
      { clave: 'glicemia', rotulo: 'Glicemia', tipo: 'numero', unidad: 'mg/dL', ancho: 1 },
      { clave: 'glasgow', rotulo: 'Glasgow', tipo: 'numero', ancho: 1, pista: 'De 3 a 15.' },
      { clave: 'saturacion', rotulo: 'Saturación', tipo: 'numero', unidad: '%', ancho: 1 },
    ],
  },
  {
    clave: 'examen',
    titulo: 'Examen físico',
    plegable: true,
    campos: [
      { clave: 'general', rotulo: 'General', tipo: 'parrafo', ancho: 4 },
      { clave: 'piel', rotulo: 'Piel y mucosas', tipo: 'parrafo', ancho: 4 },
      { clave: 'cabeza', rotulo: 'Cabeza y ORL', tipo: 'parrafo', ancho: 4 },
      { clave: 'cardiopulmonar', rotulo: 'Cardiopulmonar', tipo: 'parrafo', ancho: 4 },
      { clave: 'abdomen', rotulo: 'Abdomen', tipo: 'parrafo', ancho: 4 },
      { clave: 'miembros', rotulo: 'Miembros', tipo: 'texto', ancho: 2 },
      { clave: 'pulsos', rotulo: 'Pulsos', tipo: 'texto', ancho: 2 },
      { clave: 'neurologico', rotulo: 'Neurológico (ROT)', tipo: 'texto', ancho: 4 },
      { clave: 'observaciones', rotulo: 'Observaciones', tipo: 'parrafo', ancho: 4 },
    ],
  },
  {
    clave: 'diagnostico',
    titulo: 'Diagnóstico y tratamiento',
    campos: [
      /* Buscador de la CIE-10, no un campo de texto suelto. Sigue
         aceptando lo que el médico escriba —el cliente lo pidió
         expresamente— y cuando elige del catálogo, el código viaja con el
         nombre. Ver components/sistema/Diagnostico.astro. */
      { clave: 'idx', rotulo: 'Diagnóstico', tipo: 'diagnostico', exigido: true, ancho: 4 },
      { clave: 'via', rotulo: 'Vía del tratamiento aplicado', tipo: 'opcion',
        opciones: ['Parenteral', 'Enteral', 'Sublingual', 'Tópico', 'Nebulización', 'Sutura', 'Sondaje', 'Otro'],
        ancho: 2 },
      { clave: 'tratamiento_aplicado', rotulo: 'Tratamiento aplicado', tipo: 'parrafo', ancho: 4 },
      { clave: 'ambulatorio', rotulo: '¿Tratamiento ambulatorio?', tipo: 'si-no', ancho: 1 },
      { clave: 'laboratorio', rotulo: 'Exámenes de laboratorio', tipo: 'texto', ancho: 2 },
      { clave: 'radiologico', rotulo: 'Exámenes radiológicos', tipo: 'texto', ancho: 2 },
      { clave: 'referido', rotulo: 'Referido a', tipo: 'texto', ancho: 2 },
    ],
  },
  {
    clave: 'recipe',
    titulo: 'Récipe',
    campos: [
      { clave: 'recipe', rotulo: 'Récipe', tipo: 'parrafo', ancho: 4,
        pista: 'Un medicamento por línea, con presentación y dosis.' },
      { clave: 'indicaciones', rotulo: 'Indicaciones', tipo: 'parrafo', ancho: 4,
        pista: 'Cada cuánto y por cuántos días.' },
    ],
  },
  {
    clave: 'cierre',
    titulo: 'Cierre de la atención',
    campos: [
      { clave: 'medico', rotulo: 'Médico que atiende', tipo: 'texto', exigido: true, ancho: 2,
        pista: 'Se completa solo con el usuario que firma.' },
      { clave: 'hora_fin', rotulo: 'Hora de cierre', tipo: 'hora', exigido: true, ancho: 1 },
      { clave: 'traslado', rotulo: '¿Hubo traslado?', tipo: 'si-no', ancho: 1 },
      { clave: 'paramedico', rotulo: 'Paramédico', tipo: 'texto', ancho: 2,
        pista: 'Solo si hubo traslado.' },
    ],
  },
] as const;

/** Campos sin los cuales no se puede cerrar una atención. */
export const exigidos = historia.flatMap((s) =>
  s.campos.filter((c) => c.exigido).map((c) => ({ seccion: s.clave, ...c })),
);

/** Todas las claves, para armar la tabla y validar lo que llega. */
export const claves = historia.flatMap((s) => s.campos.map((c) => c.clave));
