/**
 * Los analitos que no se teclean: se calculan.
 *
 * Pedro lo pidió así: «en ese Excel está configurado para que tú coloques un
 * valor y otro valor, y él lo calcula, hace una relación y coloca otros
 * valores con respecto a ese valor… son fórmulas sencillas que están en ese
 * Excel, no sé si tú puedas programarlas a la propia página».
 *
 * DE DÓNDE SALEN
 *
 * De las fórmulas de su propio archivo, `LABORATORIO CA.xls`, leídas de las
 * celdas. No de un libro: son las suyas. Se repiten iguales en varias hojas
 * —el LDL aparece en PERFIL LIPIDICO, QUIMICA COMPLETA y PSA T Y L., y en
 * las tres es la misma cuenta— así que acá van una sola vez.
 *
 * LO QUE NO SE PROGRAMÓ, Y POR QUÉ
 *
 * En la hoja HEMA hay cuatro celdas con fórmula que NO son cuentas:
 *
 *     VCM        = BP25*10000000+3
 *     HCM        = BP26*10000000
 *     PLAQUETAS  = 355000+S14*100000
 *     LEUCOCITOS = S14*100000+(S14*100000*10%)+355000
 *
 * Eso no calcula nada: son números con los que alguien estuvo jugando para
 * que la hoja de ejemplo mostrara algo. Pero la misma hoja trae, cuatro
 * filas más abajo, el VCM y el HCM DE VERDAD —S19 y S20, contra los
 * eritrocitos— y esos sí están acá. Su archivo tiene las tres cuentas
 * rojas duplicadas: una pareja sirve y la otra no.
 *
 * El INR no se calcula: en su hoja es un número escrito a mano (1,08) y lo
 * correcto es así, porque depende del ISI del reactivo del lote. Si se
 * calculara con la razón pelada saldría un INR falso.
 *
 * El 7,2 de la actividad protrombínica es una constante de su método: está
 * metida en la fórmula de su celda y se respeta tal cual.
 * CÓMO SE COMPORTA EN PANTALLA
 *
 * El campo se llena solo cuando están todos sus insumos, y se vuelve a
 * calcular si uno cambia. Queda EDITABLE: quien mide puede pisarlo, y si lo
 * pisa deja de recalcularse. Un valor calculado que no se puede corregir es
 * peor que uno tecleado.
 */

/**
 * Las formas de cuenta que de verdad hay en su archivo. Van como datos y no
 * como funciones porque esta lista viaja al navegador: la pantalla
 * recalcula mientras se teclea, sin ir y volver al servidor.
 */
export type Operacion =
  /** El primero menos todos los demás: total − HDL − VLDL. */
  | { tipo: 'resta' }
  /** El primero dividido el segundo: albúmina ÷ globulinas. */
  | { tipo: 'division' }
  /** El primero dividido una constante: triglicéridos ÷ 5. */
  | { tipo: 'dividirPor'; por: number }
  /**
   * El primero sobre el segundo, por un factor. Con 100 es el CHCM
   * (hemoglobina × 100 ÷ hematocrito) y con 10 el VCM y el HCM.
   */
  | { tipo: 'divisionEscalada'; factor: number }
  /** Los dos primeros multiplicados, sobre el tercero. */
  | { tipo: 'productoSobre' }
  /**
   * La actividad protrombínica de su hoja: a los dos tiempos se les
   * descuenta una constante antes de dividirlos, y el resultado va en por
   * ciento. =(U14-7.2)/(T15-7.2)*100
   */
  | { tipo: 'relacionDescontada'; descuento: number };

export interface Calculo {
  /** El analito que se calcula, como se llama en las plantillas. */
  resultado: string;
  /** Los que hacen falta, en el orden en que entran a la cuenta. */
  insumos: string[];
  operacion: Operacion;
  decimales: number;
  /** Para explicarlo en pantalla, en palabras. */
  comoSeLee: string;
}

export const CALCULOS: readonly Calculo[] = [
  {
    resultado: 'VLDL-COLESTEROL',
    insumos: ['TRIGLICERIDOS'],
    operacion: { tipo: 'dividirPor', por: 5 },
    decimales: 1,
    comoSeLee: 'triglicéridos ÷ 5',
  },
  {
    /* Friedewald, y es la de su hoja: =U13-U14-U16. Depende del VLDL, que a
       su vez se calcula: la pantalla resuelve en cadena. */
    resultado: 'LDL-COLESTEROL',
    insumos: ['COLESTEROL TOTAL', 'HDL-COLESTEROL', 'VLDL-COLESTEROL'],
    operacion: { tipo: 'resta' },
    decimales: 1,
    comoSeLee: 'colesterol total − HDL − VLDL',
  },
  {
    resultado: 'BILIRRUBINA INDIRECTA',
    insumos: ['BILIRRUBINA TOTAL', 'BILIRRUBINA DIRECTA'],
    operacion: { tipo: 'resta' },
    decimales: 2,
    comoSeLee: 'bilirrubina total − directa',
  },
  {
    resultado: 'GLOBULINAS',
    insumos: ['PROTEINAS TOTALES', 'ALBUMINA'],
    operacion: { tipo: 'resta' },
    decimales: 2,
    comoSeLee: 'proteínas totales − albúmina',
  },
  {
    resultado: 'RELACION A/G',
    insumos: ['ALBUMINA', 'GLOBULINAS'],
    operacion: { tipo: 'division' },
    decimales: 2,
    comoSeLee: 'albúmina ÷ globulinas',
  },
  {
    /* =('DAT.'!F11/'DAT.'!F12)*10, la celda S19 de HEMA: hematocrito sobre
       eritrocitos, por diez. */
    resultado: 'VCM',
    insumos: ['HEMATOCRITO', 'ERITROCITOS'],
    operacion: { tipo: 'divisionEscalada', factor: 10 },
    decimales: 1,
    comoSeLee: 'hematocrito ÷ eritrocitos × 10',
  },
  {
    /* =('DAT.'!F10/'DAT.'!F12)*10, la celda S20. */
    resultado: 'HCM',
    insumos: ['HEMOGLOBINA', 'ERITROCITOS'],
    operacion: { tipo: 'divisionEscalada', factor: 10 },
    decimales: 1,
    comoSeLee: 'hemoglobina ÷ eritrocitos × 10',
  },
  {
    /* =S13*100/S14: hemoglobina × 100 / hematocrito. Es la celda S17; la
       S21 hace la misma cuenta con las celdas de DAT. */
    resultado: 'CHCM',
    insumos: ['HEMOGLOBINA', 'HEMATOCRITO'],
    operacion: { tipo: 'divisionEscalada', factor: 100 },
    decimales: 1,
    comoSeLee: 'hemoglobina × 100 ÷ hematocrito',
  },
  {
    resultado: 'Volumen de Orina/ min',
    insumos: ['Volumen de Orina/ 24 hrs:'],
    operacion: { tipo: 'dividirPor', por: 1440 },
    decimales: 4,
    comoSeLee: 'volumen de 24 horas ÷ 1440',
  },
  {
    /* =(AA22*AA15)/AA21: creatinina en orina × volumen de 24 horas, sobre
       la creatinina sérica. Es la suya, tal cual. */
    resultado: 'Depuración de creatinina',
    insumos: ['Creatinina en Orina', 'Volumen de Orina/ 24 hrs:', 'Creatinina Sérica'],
    operacion: { tipo: 'productoSobre' },
    decimales: 2,
    comoSeLee: '(creatinina en orina × volumen de 24 h) ÷ creatinina sérica',
  },
  {
    /* =(U14-7.2)/(T15-7.2)*100. El control va arriba y el del paciente
       abajo: así está en su celda y así se deja.

       Las dos filas se llaman igual en la hoja de coagulación —el tiempo
       de protrombina y el PTT tienen cada uno su «TIEMPO CONTROL»— y los
       insumos se buscan en las filas de arriba, no por nombre en toda la
       orden. Si no, la actividad agarraba el control del PTT. */
    resultado: 'ACTIVIDAD',
    insumos: ['TIEMPO CONTROL', 'TIEMPO PACIENTE'],
    operacion: { tipo: 'relacionDescontada', descuento: 7.2 },
    decimales: 1,
    comoSeLee: '(tiempo control − 7,2) ÷ (tiempo del paciente − 7,2) × 100',
  },
  {
    /* =T15/U14. El nombre lleva los dos puntos que trae su hoja. */
    resultado: 'RAZON P/C:',
    insumos: ['TIEMPO PACIENTE', 'TIEMPO CONTROL'],
    operacion: { tipo: 'division' },
    decimales: 2,
    comoSeLee: 'tiempo del paciente ÷ tiempo control',
  },
  {
    /* =T23-U22, en el bloque del PTT. */
    resultado: 'DIFERENCIA P-C',
    insumos: ['TIEMPO PACIENTE', 'TIEMPO CONTROL'],
    operacion: { tipo: 'resta' },
    decimales: 1,
    comoSeLee: 'tiempo del paciente − tiempo control',
  },
];

/**
 * El diferencial tiene que sumar cien. Su hoja lo comprueba en una celda
 * aparte (=F18+F19+F20+F21) que no se imprime, así que acá no es un
 * analito más: es un aviso en pantalla.
 */
export const SUMAN_CIEN = {
  partes: ['SEGMENTADOS', 'LINFOCITOS', 'EOSINOFILOS', 'MONOCITOS'],
  total: 100,
  /** Cuánto se tolera sin avisar. */
  margen: 0,
} as const;

/**
 * Los mismos nombres escritos distinto en su archivo. «RELACION A /G» con
 * espacio en una hoja y «RELACION A/G» sin él en otra; «GLOBULINA» en
 * singular en una tercera. Se resuelven con una lista y no quitando la «s»
 * final a todo: eso convertía «PROTEINAS TOTALES» en algo distinto según la
 * hoja y emparejaba cosas que no son lo mismo.
 */
const MISMO: Record<string, string> = {
  globulina: 'globulinas',
  'relaciona/g': 'relacionag',
  'relacionaa/g': 'relacionag',
};

/** Para emparejar nombres: sin tildes, sin mayúsculas y sin espacios. */
export function llaveDeAnalito(nombre: string): string {
  const plano = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
  return MISMO[plano] ?? plano;
}

/** Calcula uno, si están todos sus insumos. Null si falta alguno. */
export function calcular(c: Calculo, valores: readonly (number | null)[]): number | null {
  if (valores.length !== c.insumos.length) return null;
  if (valores.some((v) => v === null || !Number.isFinite(v))) return null;
  const v = valores as number[];

  switch (c.operacion.tipo) {
    case 'resta':
      return v.slice(1).reduce((t, x) => t - x, v[0]);
    case 'division':
      return v[1] === 0 ? null : v[0] / v[1];
    case 'dividirPor':
      return v[0] / c.operacion.por;
    case 'divisionEscalada':
      return v[1] === 0 ? null : (v[0] / v[1]) * c.operacion.factor;
    case 'productoSobre':
      return v[2] === 0 ? null : (v[0] * v[1]) / v[2];
    case 'relacionDescontada': {
      const d = c.operacion.descuento;
      return v[1] - d === 0 ? null : ((v[0] - d) / (v[1] - d)) * 100;
    }
  }
}

/** Lo que viaja al navegador: lo mismo, con las llaves ya resueltas. */
export const CALCULOS_EN_LLAVES = CALCULOS.map((c) => ({
  resultado: llaveDeAnalito(c.resultado),
  insumos: c.insumos.map(llaveDeAnalito),
  operacion: c.operacion,
  decimales: c.decimales,
  comoSeLee: c.comoSeLee,
}));
