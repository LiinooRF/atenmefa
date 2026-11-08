/**
 * Lo que el centro le escribe al paciente por WhatsApp.
 *
 * Un solo lugar. El mensaje sale desde tres pantallas —la de enviar, la
 * cola del laboratorio y la ficha del paciente— y si cada una armara su
 * texto, en un mes serían tres mensajes distintos del mismo centro.
 *
 * TRES REGLAS
 *
 *   1. Lleva el nombre del paciente. El cliente lo pidió expresamente, y
 *      tiene razón: un mensaje que arranca «Buenas, le escribimos de…» se
 *      lee como una cadena, y uno que arranca «Buenas, Carmen» se lee como
 *      el centro donde la atendieron.
 *   2. No lleva ningún dato clínico. Un chat lo lee quien tenga el teléfono
 *      en la mano, que no siempre es el paciente. Dice que está listo, no
 *      qué dice.
 *   3. No lleva la dirección de verificación. Esa página confirma que un
 *      papel es auténtico y no muestra el contenido: le sirve a la
 *      aseguradora que recibió el informe, no al paciente que quiere ver su
 *      resultado. Mandársela sería prometerle algo que no va a encontrar.
 */
import { clinica } from '../data/clinica';

/**
 * El primer nombre, para saludar.
 *
 * El campo del paciente es «Nombres y apellidos» en texto libre, así que
 * el apellido no se puede sacar sin adivinar —acá se usan dos—. El primer
 * nombre sí, y con eso alcanza para que el mensaje suene a persona.
 *
 * Si viniera vacío o raro, el saludo se arma sin nombre en vez de quedar
 * con un «Buenas, .» colgando.
 */
export function primerNombre(completo: string | null | undefined): string {
  const palabras = String(completo ?? '').trim().split(/\s+/).filter(Boolean);
  const uno = palabras[0] ?? '';
  // Nada de una sola letra: una inicial saludando se lee peor que nada.
  if (uno.length < 2) return '';
  return uno.charAt(0).toLocaleUpperCase('es') + uno.slice(1).toLocaleLowerCase('es');
}

const saludo = (nombre: string) =>
  nombre ? `Buenas, ${nombre}.` : 'Buenas.';

/** «Su informe … ya está listo». Para una atención general. */
export function avisoDeInforme(paciente: string, numero: number): string {
  return [
    `${saludo(primerNombre(paciente))} Le escribimos de ${clinica.nombre}:`,
    `su informe de atención N° ${numero} ya está listo.`,
    `Puede retirarlo en ${clinica.direccion.calle}, ${clinica.direccion.ciudad},`,
    'o decirnos por acá si prefiere que se lo enviemos a su correo.',
  ].join(' ');
}

/** «Sus resultados … ya están listos». Para una orden de laboratorio. */
export function avisoDeResultados(paciente: string, numero: number): string {
  return [
    `${saludo(primerNombre(paciente))} Le escribimos del laboratorio de ${clinica.nombre}:`,
    `los resultados de sus exámenes (orden N° ${numero}) ya están listos.`,
    `Puede retirarlos en ${clinica.direccion.calle}, ${clinica.direccion.ciudad},`,
    'o decirnos por acá si prefiere que se los enviemos a su correo.',
  ].join(' ');
}

/** El que corresponda, según el tipo de atención. */
export const avisoDe = (
  tipo: string,
  paciente: string,
  numero: number,
) => (tipo === 'laboratorio' ? avisoDeResultados(paciente, numero) : avisoDeInforme(paciente, numero));

/**
 * Para abrir un chat sin nada que avisar: desde la ficha del paciente,
 * cuando hay que preguntarle algo. Deja el saludo puesto y nada más; lo
 * que sigue lo escribe quien está atendiendo.
 */
export const saludoSuelto = (paciente: string) =>
  `${saludo(primerNombre(paciente))} Le escribimos de ${clinica.nombre}.`;
