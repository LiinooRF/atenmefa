/**
 * Descarga del cierre en Excel.
 *
 * El cliente lo pidió así: "las empresas tienen como un excel en
 * específico, yo puedo cargar mi excel". Las columnas de cada planilla
 * viven en la lista `formatos` de sistema/lib/cierre.ts; acá solo se
 * recorre lo que esa lista diga y se arma el archivo.
 *
 *   /sistema/cierre/exportar?mes=2026-11&cobrar_a=seguros-miranda&formato=atenmefa
 */
import type { APIRoute } from 'astro';
// exceljs es CommonJS: el import nombrado revienta en Node ESM
// ("Named export 'Workbook' not found"). Tiene que entrar por el default.
import ExcelJS from 'exceljs';
import { anotar } from '../../../sistema/lib/atenciones';
import { exigirEnApi } from '../../../sistema/lib/guardia';
import {
  consolidadoDelMes, formatoPara, lineasDe, mesPedido, ordenarMonedas,
  type ColumnaExcel, type LineaDeCobro,
} from '../../../sistema/lib/cierre';

export const prerender = false;

/**
 * Cómo se ve cada tipo de columna en Excel.
 *
 * 'numero' no lleva formato a propósito: en un formato propio el punto
 * decimal se dibuja siempre, así que con '0.##' el caso 557 se vería
 * "557." y una cantidad de 1 se vería "1.". El formato General de Excel ya
 * muestra el entero sin coma y el decimal con ella, en la configuración
 * regional de quien abra el archivo.
 */
const FORMATO_NUMERO: Record<string, string> = {
  dinero: '#,##0.00',
  fecha: 'dd/mm/yyyy',
};

/** Excel no admite más de 31 caracteres ni : \ / ? * [ ] en el nombre. */
function nombreDeHoja(crudo: string) {
  return crudo.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Cierre';
}

/**
 * La fecha entra como fecha de verdad, no como texto, para que el Excel la
 * ordene y la filtre. Se fija al mediodía UTC: así ninguna conversión de
 * zona la mueve al día anterior.
 */
const fechaDeExcel = (iso: string) => new Date(`${iso}T12:00:00Z`);

function celda(columna: ColumnaExcel, linea: LineaDeCobro) {
  const valor = columna.valor(linea);
  if (valor === null || valor === '') return null;
  if (columna.tipo === 'fecha') return fechaDeExcel(String(valor));
  return valor;
}

export const GET: APIRoute = async (ctx) => {
  const corte = exigirEnApi(ctx, 'exportar_cierre');
  if (corte) return corte;

  const usuario = ctx.locals.usuario!;
  const mes = mesPedido(ctx.url.searchParams.get('mes'));
  const pedido = (ctx.url.searchParams.get('cobrar_a') ?? '').trim();
  const formato = formatoPara(ctx.url.searchParams.get('formato'));

  const consolidado = await consolidadoDelMes(mes);
  const grupo = pedido ? consolidado.grupos.find((g) => g.clave === pedido) : undefined;

  if (pedido && !grupo) {
    return new Response(`No hay nada cerrado en ${mes} para ese pagador.`, {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const lineas = lineasDe(consolidado, grupo?.clave);
  if (lineas.length === 0) {
    return new Response(`El mes ${mes} no tiene renglones cerrados para exportar.`, {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const libro = new ExcelJS.Workbook();
  libro.creator = 'Atenmefa';
  libro.created = new Date();

  const hoja = libro.addWorksheet(nombreDeHoja(`${grupo?.nombre ?? 'Cierre'} ${mes}`), {
    // La cabecera queda a la vista al bajar por un mes largo.
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  hoja.columns = formato.columnas.map((c) => ({ header: c.rotulo, width: c.ancho }));
  for (const linea of lineas) {
    hoja.addRow(formato.columnas.map((c) => celda(c, linea)));
  }

  /* Una fila de totales por cada moneda que aparezca. El centro cotiza en
     dólares y cobra en bolívares por taquilla: un solo total mezclado daría
     una cifra que no se le puede pasar a nadie a cobrar.

     La palabra "Total" va en la columna justo antes de la primera que se
     suma, para que quede pegada a las cifras y no suelta al principio. */
  const primeraSuma = formato.columnas.findIndex((c) => c.sumar);
  const monedas = [...new Set(lineas.map((l) => l.moneda))].sort(ordenarMonedas);

  if (primeraSuma >= 0) {
    monedas.forEach((moneda, vuelta) => {
      const propias = lineas.filter((l) => l.moneda === moneda);
      const totales = formato.columnas.map((columna, i) => {
        if (columna.tipo === 'moneda') return moneda;
        if (columna.sumar) {
          const suma = propias.reduce((acum, l) => acum + Number(columna.valor(l) ?? 0), 0);
          return Math.round(suma * 100) / 100;
        }
        return i === primeraSuma - 1 ? 'Total' : null;
      });
      const filaTotal = hoja.addRow(totales);
      filaTotal.font = { bold: true };
      // La raya va una sola vez, bajo el último renglón: separa los datos
      // del bloque de totales sin partirlo en dos. includeEmpty para que
      // cruce la tabla completa y no solo las celdas que llevan cifra.
      if (vuelta === 0) {
        filaTotal.eachCell({ includeEmpty: true }, (c) => {
          c.border = { top: { style: 'thin' } };
        });
      }
    });
  }

  const cabecera = hoja.getRow(1);
  cabecera.font = { bold: true };
  cabecera.alignment = { vertical: 'middle' };

  formato.columnas.forEach((columna, i) => {
    const patron = FORMATO_NUMERO[columna.tipo ?? 'texto'];
    if (patron) hoja.getColumn(i + 1).numFmt = patron;
  });

  const archivo = `atenmefa-${mes}-${grupo?.clave ?? 'todos'}.xlsx`;
  const datos = await libro.xlsx.writeBuffer();

  await anotar(usuario.id, 'exporto', undefined, {
    mes,
    cobrar_a: grupo?.clave ?? 'todos',
    formato: formato.clave,
    renglones: lineas.length,
    monedas,
    archivo,
  });

  return new Response(datos as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${archivo}"`,
      'Content-Length': String(datos.byteLength),
      // Es un consolidado que cambia con cada atención que se cierra.
      'Cache-Control': 'no-store',
    },
  });
};
