/**
 * La CIE-10: capítulos y cómo se lee un nombre del catálogo.
 *
 * El catálogo en sí vive en la base —son 12.551 rúbricas, ver
 * base/011-diagnosticos.sql—. Acá quedan las dos cosas que no cambian y
 * que no vale la pena repetir doce mil veces en una columna: los veintidós
 * capítulos, y la función que convierte el nombre oficial en algo que se
 * lee.
 */

/**
 * Los veintidós capítulos, con sus títulos.
 *
 * El catálogo publica estos títulos sin tildes; acá van acentuados. Es lo
 * único que se tocó del texto oficial y es tipografía, no dato: un título
 * de capítulo no se usa para codificar nada. Los NOMBRES de las rúbricas,
 * que son los que van al lado de un código, quedaron verbatim.
 */
export const CAPITULOS: Record<string, string> = {
  I: 'Ciertas enfermedades infecciosas y parasitarias',
  II: 'Tumores (neoplasias)',
  III: 'Enfermedades de la sangre y de los órganos hematopoyéticos, y ciertos trastornos que afectan el mecanismo de la inmunidad',
  IV: 'Enfermedades endocrinas, nutricionales y metabólicas',
  V: 'Trastornos mentales y del comportamiento',
  VI: 'Enfermedades del sistema nervioso',
  VII: 'Enfermedades del ojo y sus anexos',
  VIII: 'Enfermedades del oído y de la apófisis mastoides',
  IX: 'Enfermedades del sistema circulatorio',
  X: 'Enfermedades del sistema respiratorio',
  XI: 'Enfermedades del sistema digestivo',
  XII: 'Enfermedades de la piel y del tejido subcutáneo',
  XIII: 'Enfermedades del sistema osteomuscular y del tejido conjuntivo',
  XIV: 'Enfermedades del sistema genitourinario',
  XV: 'Embarazo, parto y puerperio',
  XVI: 'Ciertas afecciones originadas en el período perinatal',
  XVII: 'Malformaciones congénitas, deformidades y anomalías cromosómicas',
  XVIII: 'Síntomas, signos y hallazgos anormales clínicos y de laboratorio, no clasificados en otra parte',
  XIX: 'Traumatismos, envenenamientos y algunas otras consecuencias de causas externas',
  XX: 'Causas externas de morbilidad y mortalidad',
  XXI: 'Factores que influyen en el estado de salud y contacto con los servicios de salud',
  XXII: 'Causas para propósitos especiales',
};

export const nombreDelCapitulo = (clave: string) =>
  CAPITULOS[clave] ?? `Capítulo ${clave}`;

/**
 * El nombre oficial, legible.
 *
 * El catálogo lo publica en mayúsculas: «INFECCIÓN DE VÍAS URINARIAS,
 * SITIO NO ESPECIFICADO». Una lista de doce mil renglones así no se lee, y
 * en el informe impreso se ve como un grito.
 *
 * Se guarda verbatim y se transforma al mostrarlo, no al revés: el dato que
 * viaja al expediente y a la planilla del seguro es el oficial.
 *
 * Lo que se pierde: el 0,8% de los nombres lleva un epónimo —Lyme, Kaposi,
 * Crohn— y queda en minúscula. Se midió antes de decidirlo. Restaurarlos
 * pedía una lista de cien apellidos para arreglar noventa y seis renglones,
 * y una lista así se equivoca sola con el tiempo; el código va siempre al
 * lado del nombre, que es lo que de verdad identifica el diagnóstico.
 */
export function comoSeLee(nombre: string): string {
  const bajo = nombre.toLocaleLowerCase('es');
  return bajo.charAt(0).toLocaleUpperCase('es') + bajo.slice(1);
}

/** Lo que se escribe en el expediente: el nombre y su código. */
export const conSuCodigo = (nombre: string, codigo: string | null | undefined) =>
  codigo ? `${comoSeLee(nombre)} (${codigo})` : comoSeLee(nombre);
