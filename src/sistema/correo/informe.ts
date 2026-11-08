/**
 * El informe que viaja por correo.
 *
 * Va en el CUERPO del mensaje y no como PDF adjunto. El cliente pidió poder
 * mandarle el informe al paciente; mandarlo adjunto obligaría a generar un
 * archivo en la VPS, y la regla del proyecto es que no quede nada guardado,
 * ni PDF ni imágenes. Así el paciente abre el correo, lo lee, y lo imprime
 * desde ahí si lo necesita.
 *
 * HTML de correo, que es otro oficio: tablas, anchos en píxeles y estilos
 * pegados a cada etiqueta. Ni flexbox ni hojas de estilo: Outlook y Gmail
 * descartan lo uno y recortan lo otro. Por eso esta plantilla es aparte de
 * la de pantalla y no un reuso forzado de ella.
 *
 * Y abajo, siempre, cómo comprobar que lo emitió el centro: la dirección de
 * verificación y el PIN. Un informe reenviado tres veces sigue pudiendo
 * comprobarse.
 */
import type { Resultado } from '../laboratorio';

export interface DatosDelInforme {
  tipo: 'general' | 'laboratorio';
  numero: number;
  fecha: string;
  paciente: string;
  cedula: string;
  edad?: string;
  sexo?: string;
  aseguradora?: string | null;
  /** Lo que se le pidió, cuando es laboratorio. */
  examenes: readonly string[];
  resultados: readonly Resultado[];
  observaciones?: string;
  /** Para una consulta: el récipe y las indicaciones. */
  recipe?: string;
  indicaciones?: string;
  idx?: string;
  /** Quien firma: el médico o el bioanalista. */
  firma: { nombre: string; colegiatura?: string | null; rol: string };
  verificacion: { url: string; pin: string | null; dominioCorto: string };
  centro: { nombre: string; direccion: string; telefono: string };
}

const AZUL = '#111663';
const GRIS = '#666666';
const LINEA = '#d9dce6';

const escapar = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fechaLarga = (f: string) =>
  new Date(`${f}T12:00:00`).toLocaleDateString('es-VE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

/** Un párrafo escrito a mano: se respetan los saltos de línea. */
const parrafo = (t: string) =>
  escapar(t).split('\n').map((l) => l.trim()).filter(Boolean).join('<br />');

export const asuntoDe = (d: DatosDelInforme) =>
  d.tipo === 'laboratorio'
    ? `Resultados de laboratorio · orden N° ${d.numero} · ${d.centro.nombre}`
    : `Informe de atención N° ${d.numero} · ${d.centro.nombre}`;

const fila = (rotulo: string, valor: string) => `
  <tr>
    <td style="padding:6px 10px 6px 0;font-size:13px;color:${GRIS};white-space:nowrap">${escapar(rotulo)}</td>
    <td style="padding:6px 0;font-size:13px;color:#1a1a1a"><strong>${escapar(valor)}</strong></td>
  </tr>`;

export function htmlDelInforme(d: DatosDelInforme): string {
  const esLab = d.tipo === 'laboratorio';
  const conValor = d.resultados.filter((r) => r.valor);

  const tablaResultados = conValor.length
    ? `
    <h2 style="margin:26px 0 8px;font-size:15px;color:${AZUL}">Resultados</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border-collapse:collapse;width:100%">
      <tr>
        ${['Examen', 'Resultado', 'Valor de referencia'].map((t) => `
        <th align="left" style="padding:7px 10px 7px 0;border-bottom:1px solid ${LINEA};
            font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:${GRIS}">${t}</th>`).join('')}
      </tr>
      ${conValor.map((r) => `
      <tr>
        <td style="padding:9px 10px 9px 0;border-bottom:1px solid #eef0f5;font-size:13px">${escapar(r.examen)}</td>
        <td style="padding:9px 10px 9px 0;border-bottom:1px solid #eef0f5;font-size:13px;color:${AZUL}">
          <strong>${escapar(r.valor)}</strong>${r.unidad ? ` <span style="color:${GRIS};font-weight:400">${escapar(r.unidad)}</span>` : ''}
        </td>
        <td style="padding:9px 0;border-bottom:1px solid #eef0f5;font-size:13px;color:${GRIS}">${escapar(r.referencia) || '—'}</td>
      </tr>`).join('')}
    </table>`
    : '';

  const listaExamenes = esLab && d.examenes.length
    ? `
    <h2 style="margin:26px 0 8px;font-size:15px;color:${AZUL}">Exámenes realizados</h2>
    <p style="margin:0;font-size:13px;line-height:1.7">${d.examenes.map(escapar).join('<br />')}</p>`
    : '';

  const receta = !esLab && (d.recipe || d.indicaciones)
    ? `
    ${d.recipe ? `<h2 style="margin:26px 0 8px;font-size:15px;color:${AZUL}">Récipe</h2>
    <p style="margin:0;font-size:13px;line-height:1.7">${parrafo(d.recipe)}</p>` : ''}
    ${d.indicaciones ? `<h2 style="margin:22px 0 8px;font-size:15px;color:${AZUL}">Indicaciones</h2>
    <p style="margin:0;font-size:13px;line-height:1.7">${parrafo(d.indicaciones)}</p>` : ''}`
    : '';

  const observa = d.observaciones
    ? `
    <h2 style="margin:26px 0 8px;font-size:15px;color:${AZUL}">Observaciones</h2>
    <p style="margin:0;font-size:13px;line-height:1.7">${parrafo(d.observaciones)}</p>`
    : '';

  const sello = d.verificacion.pin
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border-collapse:collapse;margin-top:28px;background:#f4f6fb;border:1px solid ${LINEA};border-radius:8px">
      <tr>
        <td style="padding:14px 16px">
          <strong style="font-size:13px;color:${AZUL}">Cómo comprobar que esto lo emitió ${escapar(d.centro.nombre)}</strong>
          <p style="margin:6px 0 0;font-size:12px;line-height:1.6;color:${GRIS}">
            Entre a <a href="${escapar(d.verificacion.url)}"
              style="color:${AZUL}">${escapar(d.verificacion.dominioCorto)}/verificar</a>
            y escriba la cédula del paciente y el PIN
            <strong style="color:#1a1a1a">${escapar(d.verificacion.pin)}</strong>.
            Sirve también si alguien le reenvía este correo.
          </p>
        </td>
      </tr>
    </table>`
    : '';

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="border-collapse:collapse;background:#eef0f5;margin:0;padding:0">
  <tr>
    <td align="center" style="padding:22px 12px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="border-collapse:collapse;width:600px;max-width:100%;background:#ffffff;border-radius:10px">
        <tr>
          <td style="padding:26px 26px 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif">
                  <strong style="font-size:19px;color:${AZUL}">${escapar(d.centro.nombre)}</strong><br />
                  <span style="font-size:12px;color:${GRIS}">${escapar(d.centro.direccion)}</span><br />
                  <span style="font-size:12px;color:${GRIS}">${escapar(d.centro.telefono)}</span>
                </td>
                <td align="right" style="font-family:Arial,Helvetica,sans-serif;vertical-align:top">
                  <span style="font-size:12px;color:${GRIS}">${esLab ? 'Informe de laboratorio' : 'Informe de atención'}</span><br />
                  <strong style="font-size:17px;color:${AZUL}">N° ${d.numero}</strong><br />
                  <span style="font-size:12px;color:${GRIS}">${fechaLarga(d.fecha)}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 26px 30px;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
            <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
              ${fila('Paciente', d.paciente)}
              ${fila('Documento', d.cedula)}
              ${d.edad ? fila('Edad', `${d.edad} años${d.sexo ? ` · ${d.sexo}` : ''}`) : ''}
              ${d.aseguradora ? fila('Seguro', d.aseguradora) : ''}
              ${!esLab && d.idx ? fila('Diagnóstico', d.idx) : ''}
            </table>

            ${listaExamenes}
            ${tablaResultados}
            ${receta}
            ${observa}

            <table role="presentation" cellpadding="0" cellspacing="0"
                   style="border-collapse:collapse;margin-top:34px">
              <tr>
                <td style="border-top:1px solid #1a1a1a;padding-top:6px;min-width:220px">
                  <strong style="font-size:13px">${escapar(d.firma.nombre)}</strong><br />
                  ${d.firma.colegiatura ? `<span style="font-size:12px;color:${GRIS}">${escapar(d.firma.colegiatura)}</span><br />` : ''}
                  <span style="font-size:11px;color:${GRIS}">${escapar(d.firma.rol)}</span>
                </td>
              </tr>
            </table>

            ${sello}

            <p style="margin:22px 0 0;font-size:11px;line-height:1.6;color:${GRIS}">
              Este correo se envió desde el sistema de ${escapar(d.centro.nombre)} a pedido
              de quien lo atendió. Si no era para usted, le pedimos que lo borre y nos avise.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();
}

/**
 * La versión en texto, que no es un adorno: un cliente de correo que no
 * dibuja HTML, o un filtro de spam, leen esta. Un mensaje con solo HTML
 * puntúa peor y a veces no llega.
 */
export function textoDelInforme(d: DatosDelInforme): string {
  const esLab = d.tipo === 'laboratorio';
  const lineas: string[] = [
    d.centro.nombre,
    esLab ? `Informe de laboratorio N° ${d.numero}` : `Informe de atención N° ${d.numero}`,
    fechaLarga(d.fecha),
    '',
    `Paciente: ${d.paciente}`,
    `Documento: ${d.cedula}`,
  ];
  if (d.edad) lineas.push(`Edad: ${d.edad} años${d.sexo ? ` · ${d.sexo}` : ''}`);
  if (d.aseguradora) lineas.push(`Seguro: ${d.aseguradora}`);
  if (!esLab && d.idx) lineas.push(`Diagnóstico: ${d.idx}`);

  if (esLab && d.examenes.length) {
    lineas.push('', 'EXÁMENES REALIZADOS', ...d.examenes.map((e) => `- ${e}`));
  }

  const conValor = d.resultados.filter((r) => r.valor);
  if (conValor.length) {
    lineas.push('', 'RESULTADOS');
    for (const r of conValor) {
      const ref = r.referencia ? `  (referencia: ${r.referencia})` : '';
      lineas.push(`- ${r.examen}: ${r.valor}${r.unidad ? ` ${r.unidad}` : ''}${ref}`);
    }
  }

  if (!esLab && d.recipe) lineas.push('', 'RÉCIPE', d.recipe);
  if (!esLab && d.indicaciones) lineas.push('', 'INDICACIONES', d.indicaciones);
  if (d.observaciones) lineas.push('', 'OBSERVACIONES', d.observaciones);

  lineas.push(
    '',
    `${d.firma.nombre}${d.firma.colegiatura ? ` · ${d.firma.colegiatura}` : ''}`,
    d.firma.rol,
  );

  if (d.verificacion.pin) {
    lineas.push(
      '',
      `Para comprobar que esto lo emitió ${d.centro.nombre}, entre a ${d.verificacion.url}`,
      `y escriba la cédula del paciente y el PIN ${d.verificacion.pin}.`,
    );
  }

  lineas.push(
    '',
    `Enviado desde el sistema de ${d.centro.nombre} a pedido de quien lo atendió.`,
  );

  return lineas.join('\n');
}
