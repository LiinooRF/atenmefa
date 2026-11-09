import type { APIRoute } from 'astro';

/**
 * En la vista previa se bloquea todo: no queremos una copia del sitio
 * compitiendo en Google con el dominio real.
 */
import { marca } from '../data/marca';

/* La vista previa y la demostración se bloquean enteras: ninguna copia
   compite en Google con el sitio real, y una demo indexada con el nombre
   de otro centro es peor todavía. */
const previa = process.env.PREVIA === '1' || marca.demo;

export const GET: APIRoute = ({ site }) => {
  const cuerpo = previa
    ? `User-agent: *\nDisallow: /\n`
    : `# Atenmefa

User-agent: *
Allow: /

# Rastreadores de IA: se les deja entrar a propósito.
# Google-Extended es el que decide si Gemini puede usar este contenido para
# fundamentar sus respuestas. Bloquearlo saca a la clínica de las respuestas
# donde justamente queremos aparecer.
User-agent: Google-Extended
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ChatGPT-User
Allow: /

# La plataforma clínica interna, cuando exista, va bloqueada acá
# y además detrás de login y con noindex.
# Disallow: /sistema/

Sitemap: ${new URL('sitemap-index.xml', site).href}
`;

  return new Response(cuerpo, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
