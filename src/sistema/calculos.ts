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
  | { tipo: 'relacionDescontada'; descuento: number }
  /**
   * El primero sobre el segundo, elevado a una potencia. Es el INR: la
   * razón paciente/control elevada al ISI del reactivo, que el laboratorio
   * informó como 1,17.
   */
  | { tipo: 'potenciaDeCociente'; exponente: number };

export interface Calculo {
  /** El analito que se calcula, como se llama en las plantillas. */
  resultado: string;
  /** Los que hacen falta, en el orden en que entran a la cuenta. */
  insumos: string[];
  operacion: Operacion;
  decimales: number;
  /** Para explicarlo en pantalla, en palabras. `{n}` es el número ajustable. */
  comoSeLee: string;
  /**
   * El número de la cuenta que depende del laboratorio y no de la
   * aritmética: el ISI del reactivo, la constante de la actividad, el
   * divisor del VLDL. El laboratorio lo cambia en la pantalla de fórmulas;
   * lo demás —el ×10 del VCM, los 1440 minutos del día— es conversión de
   * unidades y no se toca. Ver lib/formulas.ts.
   */
  ajustable?: { clave: string; rotulo: string; min: number; max: number };
}

export const CALCULOS: readonly Calculo[] = [
  {
    resultado: 'VLDL-COLESTEROL',
    insumos: ['TRIGLICERIDOS'],
    operacion: { tipo: 'dividirPor', por: 5 },
    decimales: 1,
    comoSeLee: 'triglicéridos ÷ {n}',
    ajustable: { clave: 'vldl_divisor', rotulo: 'Divisor de los triglicéridos', min: 1, max: 10 },
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
  /* LA DEPURACIÓN DE CREATININA NO SE CALCULA, por ahora.

     Su celda es =(AA22*AA15)/AA21: creatinina en orina × volumen de 24 h,
     sobre la creatinina sérica. Con el ejemplo de su hoja (4,38) da 83,77,
     razonable, pero solo si el volumen se escribe en LITROS, y la hoja dice
     «ml/24 hrs»: con 1440 ml daba 27.540. La cuenta de libro usa además el
     volumen por minuto. El laboratorio dijo «debo repasar ese tema,
     omítelo mientras» (15-11), así que se escribe a mano hasta que lo
     confirmen. Un número mal calculado en un informe es peor que un campo
     vacío. La operación 'productoSobre' queda para cuando vuelva. */
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
    comoSeLee: '(tiempo control − {n}) ÷ (tiempo del paciente − {n}) × 100',
    ajustable: { clave: 'actividad_descuento', rotulo: 'Lo que se descuenta a los dos tiempos', min: 0, max: 20 },
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
    /* INR=(TP/TC)^1,17, como lo mandó el laboratorio el 15-11-2026. El
       1,17 es el ISI de su reactivo: si cambian de lote o de marca, cambia
       este número y nada más. Va en el bloque del tiempo de protrombina,
       debajo de la razón P/C, así que sus dos tiempos son los de arriba. */
    resultado: 'INR',
    insumos: ['TIEMPO PACIENTE', 'TIEMPO CONTROL'],
    operacion: { tipo: 'potenciaDeCociente', exponente: 1.17 },
    decimales: 2,
    comoSeLee: '(tiempo del paciente ÷ tiempo control) elevado a {n}',
    ajustable: { clave: 'inr_isi', rotulo: 'ISI del reactivo', min: 0.5, max: 3 },
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
    case 'potenciaDeCociente':
      return v[1] === 0 || v[0] / v[1] < 0 ? null : (v[0] / v[1]) ** c.operacion.exponente;
  }
}

/** El número ajustable de una cuenta, tal como está en su operación. */
export function valorAjustable(c: Calculo): number | null {
  if (!c.ajustable) return null;
  const o = c.operacion;
  if (o.tipo === 'dividirPor') return o.por;
  if (o.tipo === 'relacionDescontada') return o.descuento;
  if (o.tipo === 'potenciaDeCociente') return o.exponente;
  return null;
}

/** La misma cuenta con otro valor en su número ajustable. */
export function conValor(c: Calculo, n: number): Calculo {
  const o = c.operacion;
  if (o.tipo === 'dividirPor') return { ...c, operacion: { ...o, por: n } };
  if (o.tipo === 'relacionDescontada') return { ...c, operacion: { ...o, descuento: n } };
  if (o.tipo === 'potenciaDeCociente') return { ...c, operacion: { ...o, exponente: n } };
  return c;
}

/** Cómo se lee, con el número que tiene ahora y con coma decimal. */
export const comoSeLeeAhora = (c: Calculo) => {
  const n = valorAjustable(c);
  return n === null ? c.comoSeLee : c.comoSeLee.replaceAll('{n}', String(n).replace('.', ','));
};

/** Lo que viaja al navegador: las cuentas con las llaves ya resueltas. */
export const enLlaves = (calculos: readonly Calculo[]) => calculos.map((c) => ({
  resultado: llaveDeAnalito(c.resultado),
  insumos: c.insumos.map(llaveDeAnalito),
  operacion: c.operacion,
  decimales: c.decimales,
  comoSeLee: comoSeLeeAhora(c),
}));

/** Con los valores de fábrica. Las pantallas usan calculosVigentes() de lib/formulas.ts. */
export const CALCULOS_EN_LLAVES = enLlaves(CALCULOS);
