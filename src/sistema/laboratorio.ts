/**
 * Modelo de una atención de laboratorio.
 *
 * Dos pasos y no nueve: no hay examen físico ni diagnóstico que escribir.
 * Se registra a quién se le toma la muestra y qué exámenes se le piden.
 *
 * QUIÉN LLENA QUÉ
 *
 * El cliente lo dictó así: «va a estar el recepcionista, que es el que va a
 * colocar el nombre del paciente, los exámenes que se va a hacer, si es
 * particular o un asegurador… y el propio licenciado va a colocar, de esos
 * exámenes que se mandó a hacer, los resultados».
 *
 * De ahí la forma de esta pieza: los dos pasos de acá son de recepción y
 * terminan en una orden abierta. Los resultados son otra pantalla, la del
 * bioanalista, y viven en su propia columna —no en `datos`— porque son una
 * lista de mediciones y `datos` es plano.
 *
 * LOS VALORES DE REFERENCIA NO ESTÁN INVENTADOS NI LO VAN A ESTAR
 *
 * El cliente tiene un Excel con todos sus exámenes, sus valores de
 * referencia y sus fórmulas, y quedó en mandarlo. Un rango de referencia
 * depende del método y del equipo de CADA laboratorio: poner acá los de un
 * libro y que salgan impresos al lado de un resultado sería firmar en su
 * nombre algo que no medimos. Hasta que llegue el Excel, el campo de
 * referencia se escribe a mano y nace vacío.
 */
import type { Seccion } from './historia';

/** Una medición cargada por el bioanalista. */
export interface Resultado {
  /** Lo que se midió, tal como va impreso. */
  examen: string;
  valor: string;
  unidad: string;
  /** El rango del propio laboratorio. Lo escribe el bioanalista. */
  referencia: string;
}

/**
 * Los exámenes que el centro ya dice que hace, para cuando el catálogo de
 * precios todavía está vacío.
 *
 * Sale del folleto del propio cliente, no de un catálogo inventado. En
 * cuanto administración cargue los exámenes en Servicios y precios, la
 * pantalla usa esos —que además traen el precio— y esta lista deja de
 * mostrarse.
 */
export const EXAMENES = [
  {
    grupo: 'Hematología',
    items: ['Hematología completa', 'Hemoglobina y hematocrito', 'Contaje de plaquetas'],
  },
  {
    grupo: 'Química sanguínea',
    items: ['Glicemia', 'Urea', 'Creatinina', 'Perfil lipídico', 'Ácido úrico'],
  },
  {
    grupo: 'Orina y heces',
    items: ['Examen de orina', 'Examen de heces'],
  },
] as const;

/**
 * Los dos pasos.
 *
 * El primero es el mismo "quién es" de la atención general, recortado: para
 * una muestra no hace falta el domicilio ni la referencia del lugar. Lo que
 * sí hace falta, y en la historia clínica era opcional, es cómo
 * encontrarlo: el informe se le manda por WhatsApp o por correo, y sin uno
 * de los dos no hay a dónde mandarlo.
 */
export const laboratorio: readonly Seccion[] = [
  {
    clave: 'registro',
    titulo: 'Registro',
    campos: [
      { clave: 'nombre', rotulo: 'Nombres y apellidos', tipo: 'texto', exigido: true, ancho: 4 },
      /* "o documento" y no "Cédula" a secas: el que llega sin cédula también
         se hace exámenes. Ver src/sistema/lib/documento.ts. */
      { clave: 'cedula', rotulo: 'Cédula o documento', tipo: 'cedula', exigido: true, ancho: 2 },
      /* La fecha de nacimiento, igual que en la historia clínica: con ella
         la edad se calcula sola mientras se escribe. No se exige. */
      { clave: 'nacimiento', rotulo: 'Fecha de nacimiento', tipo: 'fecha', ancho: 1,
        pista: 'Con ella la edad se calcula sola.' },
      /* Basta la fecha o la edad; el servidor comprueba que haya una de
         las dos. */
      { clave: 'edad', rotulo: 'Edad', tipo: 'numero', unidad: 'años', ancho: 1 },
      { clave: 'sexo', rotulo: 'Sexo', tipo: 'opcion', opciones: ['Femenino', 'Masculino'], exigido: true, ancho: 1 },
      { clave: 'telefono', rotulo: 'Teléfono', tipo: 'telefono', ancho: 2 },
      { clave: 'whatsapp', rotulo: 'WhatsApp', tipo: 'telefono', ancho: 2,
        pista: 'Solo si es otro número. Es a donde se le avisa que está listo.' },
      { clave: 'correo', rotulo: 'Correo', tipo: 'correo', ancho: 4,
        pista: 'A donde se le manda el informe.' },
      { clave: 'fecha', rotulo: 'Fecha', tipo: 'fecha', exigido: true, ancho: 1 },
      { clave: 'hora_muestra', rotulo: 'Hora de la muestra', tipo: 'hora', ancho: 1 },
      { clave: 'aseguradora', rotulo: 'Seguro', tipo: 'texto', ancho: 2,
        pista: 'En blanco si paga el paciente.' },
      { clave: 'poliza', rotulo: 'Póliza', tipo: 'texto', ancho: 2 },
      { clave: 'quien_indica', rotulo: 'Médico que indica', tipo: 'texto', ancho: 2,
        pista: 'Quien mandó los exámenes, si vino con orden.' },
    ],
  },
  {
    clave: 'examenes',
    titulo: 'Exámenes',
    campos: [
      /* La lista de arriba es el catálogo, que trae precio. Esto es para lo
         que no está en el catálogo, y para que una orden se pueda registrar
         hoy aunque administración todavía no haya cargado los precios. Las
         órdenes viejas, de antes del catálogo, tienen todo acá. */
      { clave: 'examenes', rotulo: 'Otros exámenes', tipo: 'parrafo', ancho: 4,
        pista: 'Uno por línea. Lo que no esté en la lista de arriba.' },
      { clave: 'ayuno', rotulo: '¿Vino en ayunas?', tipo: 'si-no', ancho: 2 },
      { clave: 'observaciones_lab', rotulo: 'Observaciones', tipo: 'parrafo', ancho: 4,
        pista: 'Muestra hemolizada, paciente con tratamiento, lo que haya que anotar.' },
    ],
  },
];
