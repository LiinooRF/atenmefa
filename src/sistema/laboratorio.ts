/**
 * Modelo de una atención de laboratorio.
 *
 * Dos pasos y no nueve: no hay examen físico ni diagnóstico que escribir.
 * Se registra a quién se le toma la muestra y qué exámenes se le piden.
 *
 * ESTO ESTÁ A MEDIO HACER, A PROPÓSITO
 *
 * El cliente quedó en mandar un video con cómo trabaja su laboratorio. Lo
 * que hay acá es el armazón: los dos pasos, el registro y la lista de
 * exámenes, para que al llegar el video sea cambiar esta lista y no volver a
 * construir la pantalla.
 *
 * La lista de exámenes sale de lo que el propio cliente ya tiene publicado
 * en su folleto, no de un catálogo inventado: hematología completa, química
 * sanguínea, orina y heces. Lo que falte lo dirá el video.
 *
 * TODAVÍA NO CIERRA. Se guarda como borrador. Cerrar una atención de
 * laboratorio significa que los resultados están listos, y eso depende de
 * cómo los entreguen, que es justo lo que falta saber.
 */
import type { Seccion } from './historia';

/** Los exámenes que el centro ya dice que hace. */
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
 * una muestra no hace falta el domicilio ni la referencia del lugar. El
 * segundo es lo que se le pide.
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
      { clave: 'edad', rotulo: 'Edad', tipo: 'numero', exigido: true, unidad: 'años', ancho: 1 },
      { clave: 'sexo', rotulo: 'Sexo', tipo: 'opcion', opciones: ['Femenino', 'Masculino'], exigido: true, ancho: 1 },
      { clave: 'telefono', rotulo: 'Teléfono', tipo: 'telefono', ancho: 2 },
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
      { clave: 'examenes', rotulo: 'Qué se le pidió', tipo: 'parrafo', exigido: true, ancho: 4,
        pista: 'Uno por línea. Los botones de arriba los agregan.' },
      { clave: 'ayuno', rotulo: '¿Vino en ayunas?', tipo: 'si-no', ancho: 2 },
      { clave: 'observaciones_lab', rotulo: 'Observaciones', tipo: 'parrafo', ancho: 4,
        pista: 'Muestra hemolizada, paciente con tratamiento, lo que haya que anotar.' },
    ],
  },
];

/** Lo que hace falta para poder guardar algo útil. */
export const exigidosLaboratorio = laboratorio
  .flatMap((s) => s.campos)
  .filter((c) => c.exigido);
