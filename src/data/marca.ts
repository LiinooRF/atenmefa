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
 * Petróleo y coral. Se probó primero con los colores de UC CHRISTUS —azul
 * y morado— y no funcionó: en una pantalla con barra oscura y un botón de
 * acción grande, dos tonos saturados peleando se ven baratos. El petróleo
 * da fondo serio y el coral deja un solo punto cálido, que es el botón que
 * hay que apretar.
 *
 * Sin razón social ni RIF: inventarle un registro mercantil a una empresa
 * que no existe es la clase de detalle que aparece en una captura de
 * pantalla y no se puede explicar.
 */
const VIVA_SALUD: Marca = {
  id: 'vivosalud',
  nombre: entorno('MARCA_NOMBRE') || 'Viva Salud',
  bajada: entorno('MARCA_BAJADA') || 'Red de salud',
  razonSocial: entorno('MARCA_RAZON') || '',
  rif: entorno('MARCA_RIF') || '',
  logo: '/logo-vivosalud.svg',
  paleta: {
    profundo: '#0b3b45',
    base: '#0f5563',
    medio: '#14788c',
    tenue: '#e6f2f4',
    acento: '#c2453d',
    acentoHondo: '#9a332c',
    sombra: '11 59 69',
  },
  demo: true,
};

const TODAS: Record<string, Marca> = {
  atenmefa: ATENMEFA,
  vivosalud: VIVA_SALUD,
};

export const marca: Marca = TODAS[entorno('MARCA') ?? 'atenmefa'] ?? ATENMEFA;

/**
 * Las variables de color de esta marca, para pegar en un <style>.
 *
 * El selector es `html:root` y no `:root` a propósito: Astro decide por su
 * cuenta si la hoja global va enlazada o incrustada, y cuando la incrusta
 * queda DESPUÉS de este bloque. Con la misma especificidad gana la última,
 * así que los colores de la marca se perdían y la demostración salía con
 * los del otro centro. Un selector más específico gana sin depender del
 * orden.
 */
export const variablesDeLaMarca = (p = marca.paleta) =>
  'html:root{' + [
    `--azul-profundo:${p.profundo}`,
    `--azul:${p.base}`,
    `--azul-medio:${p.medio}`,
    `--azul-tenue:${p.tenue}`,
    `--rojo:${p.acento}`,
    `--rojo-hondo:${p.acentoHondo}`,
    `--flota:0 10px 24px -10px rgb(${p.sombra} / 0.45), 0 2px 6px -2px rgb(${p.sombra} / 0.2)`,
    `--flota-alta:0 22px 48px -18px rgb(${p.sombra} / 0.55), 0 4px 10px -4px rgb(${p.sombra} / 0.22)`,
  ].join(';') + '}';
