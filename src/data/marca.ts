/**
 * De quién es este sistema.
 *
 * El mismo código corre para el centro real y para la demostración que se
 * le muestra a otro centro clínico. Lo único que cambia es esta capa:
 * nombre, colores, logo y datos de contacto. Un fork del repositorio por
 * cada demo sería imposible de mantener —cada arreglo habría que hacerlo
 * dos veces y uno de los dos se olvida— así que la marca se elige con una
 * variable de entorno:
 *
 *     MARCA=atenmefa    (el centro real; es el valor por omisión)
 *     MARCA=vivosalud   (la demostración)
 *
 * Y los datos de la demo se pueden pisar uno por uno sin tocar código,
 * para re-apuntarla al prospecto de turno:
 *
 *     MARCA_NOMBRE="Clínica del Valle"
 *     MARCA_DIRECCION="Av. Siempre Viva 1234, Santiago"
 *     MARCA_TELEFONO="+56 2 2200 1000"
 */
import { entorno } from '../sistema/lib/entorno';

export interface Paleta {
  profundo: string;
  base: string;
  medio: string;
  tenue: string;
  acento: string;
  acentoHondo: string;
  /**
   * El color profundo en componentes separados por ESPACIO, no por coma:
   * `rgb(11 15 69 / 0.45)` es válido y `rgb(11, 15, 69 / 0.45)` no lo es.
   * Mezclar las dos sintaxis invalida la regla entera y la sombra
   * desaparece sin avisar.
   */
  sombra: string;
}

export interface Marca {
  id: string;
  nombre: string;
  /** Lo que va abajo del nombre en el logo. */
  bajada: string;
  /** Razón social y RIF, para los papeles. Vacío = no se imprime. */
  razonSocial: string;
  rif: string;
  logo: string;
  paleta: Paleta;
  /** La demo no se indexa y no muestra el sitio público. */
  demo: boolean;
}

const ATENMEFA: Marca = {
  id: 'atenmefa',
  nombre: 'Atenmefa',
  bajada: 'Atención médica familiar',
  razonSocial: 'ATENMEFA JT, C.A.',
  rif: 'J-50864866-8',
  logo: '/logo.png',
  paleta: {
    profundo: '#0b0f45',
    base: '#111663',
    medio: '#272f9c',
    tenue: '#e9ebf7',
    acento: '#d31c24',
    acentoHondo: '#9d1119',
    sombra: '11 15 69',
  },
  demo: false,
};

/**
 * La demostración.
 *
 * Los colores son los de la Red de Salud UC CHRISTUS, leídos de su propio
 * sitio: el azul #2A7DE1 y el morado #872899. Es a propósito: la demo se
 * le muestra a centros que conocen esa estética y ayuda a que vean el
 * sistema con su propia ropa puesta, no con la del centro de al lado.
 *
 * Sin razón social ni RIF: inventarle un registro mercantil a una empresa
 * que no existe es la clase de detalle que aparece en una captura de
 * pantalla y no se puede explicar.
 */
const VIVO_SALUD: Marca = {
  id: 'vivosalud',
  nombre: entorno('MARCA_NOMBRE') || 'Vivo Salud',
  bajada: entorno('MARCA_BAJADA') || 'Red de salud',
  razonSocial: entorno('MARCA_RAZON') || '',
  rif: entorno('MARCA_RIF') || '',
  logo: '/logo-vivosalud.svg',
  paleta: {
    /* El azul de la barra se levanta hasta el tono de ellos: con el
       original la cabecera quedaba casi igual de oscura que la del otro
       centro y de lejos parecían el mismo producto. */
    profundo: '#16467f',
    base: '#1b5bb0',
    medio: '#2a7de1',
    tenue: '#e7f0fc',
    acento: '#872899',
    acentoHondo: '#671e75',
    sombra: '22 70 127',
  },
  demo: true,
};

const TODAS: Record<string, Marca> = {
  atenmefa: ATENMEFA,
  vivosalud: VIVO_SALUD,
};

export const marca: Marca = TODAS[entorno('MARCA') ?? 'atenmefa'] ?? ATENMEFA;

/** Las variables de color de esta marca, para pegar en un <style>. */
export const variablesDeLaMarca = (p = marca.paleta) =>
  [
    `--azul-profundo:${p.profundo}`,
    `--azul:${p.base}`,
    `--azul-medio:${p.medio}`,
    `--azul-tenue:${p.tenue}`,
    `--rojo:${p.acento}`,
    `--rojo-hondo:${p.acentoHondo}`,
    `--flota:0 10px 24px -10px rgb(${p.sombra} / 0.45), 0 2px 6px -2px rgb(${p.sombra} / 0.2)`,
    `--flota-alta:0 22px 48px -18px rgb(${p.sombra} / 0.55), 0 4px 10px -4px rgb(${p.sombra} / 0.22)`,
  ].join(';');
