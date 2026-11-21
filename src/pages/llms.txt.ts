import type { APIRoute } from 'astro';
import { marca } from '../data/marca';
import { clinica, servicios, catalogoDePreguntas } from '../data/clinica';

/**
 * llms.txt: el índice del sitio en texto plano para los buscadores de IA.
 * El estándar (llmstxt.org) pide un resumen y la lista de páginas con su
 * dirección. Le da a Perplexity y compañía el mapa que el sitemap da a
 * Google; el robots.txt ya los deja entrar a propósito.
 */
const previa = process.env.PREVIA === '1' || marca.demo;

export const GET: APIRoute = ({ site }) => {
  if (previa) return new Response('Disabled\n', { status: 404 });
  const base = site.href.replace(/\/$/, '');
  const lineas: string[] = [
    `# ${marca.nombre}`,
    '',
    clinica.descripcionCorta,
    '',
    `## Servicios`,
    ...servicios.map((s) => `- [${s.titulo}](${base}/servicios/${s.slug}/): ${s.resumen?.slice(0, 110) ?? ''}`),
    '',
    `## Preguntas frecuentes`,
    ...catalogoDePreguntas.map((p) => `- [${p.pregunta}](${base}/preguntas/${p.slug}/)`),
    '',
    `## Comprobar un documento`,
    `- [Verificar](${base}/verificar/): autenticidad de un informe con la cédula del paciente y el PIN impreso. No indexar.`,
    '',
  ];
  return new Response(lineas.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
