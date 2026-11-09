/**
 * Los resultados del laboratorio en Excel.
 *
 * El cliente enumeró tres salidas: «varias opciones, de descargar el PDF o
 * el Excel, o para imprimir, o la opción que te envíe por el WhatsApp del
 * usuario». El PDF lo saca el navegador desde el documento; el WhatsApp y
 * el correo están en /enviar; esto es el Excel.
 *
 * Para qué sirve de verdad: él tiene un Excel propio con sus valores de
 * referencia y sus fórmulas, y las aseguradoras piden planillas. Un informe
 * que se puede abrir en Excel entra en las dos cosas sin volver a teclear.
 *
 * No se guarda nada: el archivo se arma en memoria y se escribe en la
 * respuesta. Igual que el QR y que el PDF, no toca el disco de la VPS.
 */
import type { APIRoute } from 'astro';
import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import { bd, esquema } from '../../../../sistema/lib/base';
import { anotar, esIdentificador } from '../../../../sistema/lib/atenciones';
import { exigirEnApi } from '../../../../sistema/lib/guardia';
import { examenesPedidos } from '../../../../sistema/lib/laboratorio';
import { comoSeLee } from '../../../../sistema/lib/documento';
import { clinica } from '../../../../data/clinica';
import type { Resultado } from '../../../../sistema/laboratorio';

export const prerender = false;

const AZUL = 'FF111663';

export const GET: APIRoute = async (ctx) => {
  const corte = exigirEnApi(ctx, 'imprimir_documento');
  if (corte) return corte;

  const usuario = ctx.locals.usuario!;
  const { id } = ctx.params;
  if (!id || !esIdentificador(id)) return new Response('No existe', { status: 404 });

  const [caso] = await bd
    .select({
      id: esquema.atencion.id,
      numero: esquema.atencion.numero,
      tipo: esquema.atencion.tipo,
      estado: esquema.atencion.estado,
      fecha: esquema.atencion.fecha,
      aseguradora: esquema.atencion.aseguradora,
      poliza: esquema.atencion.poliza,
      datos: esquema.atencion.datos,
      resultados: esquema.atencion.resultados,
      resultadosPor: esquema.atencion.resultadosPor,
      pin: esquema.atencion.pin,
      paciente: esquema.paciente.nombre,
      cedula: esquema.paciente.cedula,
      tipoDoc: esquema.paciente.tipoDoc,
    })
    .from(esquema.atencion)
    .innerJoin(esquema.paciente, eq(esquema.paciente.id, esquema.atencion.pacienteId))
    .where(eq(esquema.atencion.id, id))
    .limit(1);

  if (!caso) return new Response('No existe', { status: 404 });
  if (caso.tipo !== 'laboratorio') {
    return new Response('Esto solo existe para órdenes de laboratorio.', { status: 404 });
  }

  const d = (caso.datos ?? {}) as Record<string, string>;
  const resultados = (caso.resultados ?? []) as Resultado[];
  const pedidos = await examenesPedidos(caso.id);

  const [firmante] = caso.resultadosPor
    ? await bd
        .select({ nombre: esquema.user.name, colegiatura: esquema.user.colegiatura })
        .from(esquema.user)
        .where(eq(esquema.user.id, caso.resultadosPor))
        .limit(1)
    : [];

  const libro = new ExcelJS.Workbook();
  libro.creator = clinica.nombre;
  const hoja = libro.addWorksheet(`Orden ${caso.numero}`);

  hoja.columns = [
    { width: 38 }, { width: 16 }, { width: 12 }, { width: 30 },
  ];

  const titulo = (texto: string) => {
    const f = hoja.addRow([texto]);
    f.font = { bold: true, size: 12, color: { argb: AZUL } };
    return f;
  };
  const dato = (rotulo: string, valor: string) => {
    const f = hoja.addRow([rotulo, valor]);
    f.getCell(1).font = { bold: true };
    return f;
  };

  titulo(`${clinica.nombre} · Informe de laboratorio`);
  hoja.addRow([`${clinica.razonSocial} · RIF ${clinica.rif}`]);
  hoja.addRow([`${clinica.direccion.calle} · ${clinica.direccion.ciudad}`]);
  hoja.addRow([]);

  dato('Orden N°', String(caso.numero));
  dato('Fecha de la muestra', caso.fecha);
  if (d.hora_muestra) dato('Hora', d.hora_muestra);
  dato('Paciente', caso.paciente);
  dato('Documento', comoSeLee(caso.tipoDoc, caso.cedula));
  if (d.edad) dato('Edad', `${d.edad} años`);
  if (d.sexo) dato('Sexo', d.sexo);
  dato('Seguro', caso.aseguradora ?? 'Paga el paciente');
  if (caso.poliza) dato('Póliza', caso.poliza);
  if (d.quien_indica) dato('Indicado por', d.quien_indica);
  if (d.ayuno) dato('En ayunas', d.ayuno === 'si' ? 'Sí' : 'No');
  hoja.addRow([]);

  const conValor = resultados.filter((r) => r.valor);
  if (conValor.length > 0) {
    titulo('Resultados');
    const cabecera = hoja.addRow(['Examen', 'Resultado', 'Unidad', 'Valor de referencia']);
    cabecera.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cabecera.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    });

    for (const r of conValor) {
      /* El valor se escribe como número cuando lo es: el cliente va a
         cruzar esto con sus propias fórmulas, y un "13,4" guardado como
         texto no se multiplica por nada. Lo que no es número —un "negativo",
         un "no reactivo"— va tal cual. */
      const comoNumero = Number(String(r.valor).replace(',', '.'));
      const escribible = r.valor !== '' && Number.isFinite(comoNumero)
        ? comoNumero
        : r.valor;
      const f = hoja.addRow([r.examen, escribible, r.unidad, r.referencia]);
      f.getCell(2).font = { bold: true };
    }
  } else {
    titulo('Exámenes solicitados');
    const lista = [
      ...pedidos.map((p) => p.nombre),
      ...(d.examenes ?? '').split('\n').map((t) => t.trim()).filter(Boolean),
    ];
    for (const nombre of lista) hoja.addRow([nombre]);
    hoja.addRow([]);
    hoja.addRow(['Sin resultados cargados todavía.']);
  }

  if (d.observaciones_lab) {
    hoja.addRow([]);
    titulo('Observaciones');
    hoja.addRow([d.observaciones_lab]);
  }

  hoja.addRow([]);
  if (firmante) {
    dato('Bioanalista', `${firmante.nombre}${firmante.colegiatura ? ` · ${firmante.colegiatura}` : ''}`);
  }
  if (caso.pin) {
    dato('Verificación', `${clinica.dominio.replace(/^https?:\/\//, '')}/verificar · PIN ${caso.pin}`);
  }

  await anotar(usuario.id, 'exporto', caso.id, { formato: 'xlsx', numero: caso.numero });

  const buffer = await libro.xlsx.writeBuffer();
  /* El nombre lleva el número de orden y la cédula: en la carpeta de
     descargas de recepción, "resultados.xlsx (3)" no le sirve a nadie. */
  const archivo = `laboratorio-${caso.numero}-${caso.cedula.replace(/\W/g, '')}.xlsx`;

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${archivo}"`,
      'Cache-Control': 'no-store',
    },
  });
};
