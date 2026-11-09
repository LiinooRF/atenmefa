import { defineMiddleware } from 'astro:middleware';
import { auth } from './sistema/lib/auth';
import { entorno } from './sistema/lib/entorno';
import { medirPaginaPublica } from './sistema/lib/visitas';
import { dondeEmpieza } from './sistema/lib/permisos';
import { marca } from './data/marca';

/* Los orígenes desde los que se aceptan formularios.

   URL_BASE es el público —el que va en los enlaces del informe—, y
   ORIGENES_EXTRA lleva los demás nombres por los que se puede entrar al
   mismo sistema, separados por coma. Localhost queda para desarrollo y
   para las pruebas.

   Hace falta porque el sistema responde por más de un nombre: el dominio
   del centro y el de respaldo del servidor. El día que se agregó el
   segundo, entrar por él devolvía «Origen no permitido» y parecía que la
   clave estaba mal: el formulario llegaba con un Origin que no era el
   único configurado. */
const PROPIOS = new Set(
  [
    entorno('URL_BASE'),
    ...(entorno('ORIGENES_EXTRA') ?? '').split(',').map((u) => u.trim()),
    'http://localhost:4321',
    'http://localhost:4399',
  ]
    .filter(Boolean)
    .map((u) => {
      try {
        return new URL(u!).origin;
      } catch {
        /* Un nombre mal escrito en la variable no puede tumbar el arranque
           entero: se ignora ese y los demás siguen valiendo. */
        return '';
      }
    })
    .filter(Boolean),
);

/**
 * Defensa contra formularios enviados desde otro sitio.
 *
 * Reemplaza al chequeo de Astro, que detrás de un proxy compara contra el
 * esquema del socket (http) en vez del público (https) y rechaza todo.
 * Acá se compara contra el origen que la aplicación tiene configurado.
 */
function vieneDeAfuera(pedido: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(pedido.method)) return false;

  const origen = pedido.headers.get('origin');
  if (origen) return !PROPIOS.has(origen);

  /* Sin Origin se mira el Referer. Si no hay ninguno de los dos se
     rechaza: un formulario de verdad siempre manda al menos uno. */
  const referente = pedido.headers.get('referer');
  if (!referente) return true;
  try {
    return !PROPIOS.has(new URL(referente).origin);
  } catch {
    return true;
  }
}

/**
 * Guardia de /sistema/. Todo lo de adentro exige sesión; el resto del
 * sitio es estático y no toca la base.
 */
export const onRequest = defineMiddleware(async (ctx, siguiente) => {
  /* En la demostración no hay sitio público: lo que se muestra es la
     plataforma. Publicar un folleto con la dirección y los teléfonos de un
     centro que no existe es inventar datos, y además no es lo que se está
     vendiendo.

     Va acá y no en la portada: si la portada decidiera, dejaría de ser
     estática para las dos marcas y se caería del sitemap del centro real,
     que es su página más importante. */
  if (marca.demo && !ctx.url.pathname.startsWith('/sistema')) {
    /* La raíz NO entra acá: ahí se dibuja la tapa, que es lo que se
       comparte por enlace. Redirigirla también la convertía en un archivo
       con «refresh» de dos segundos, que se ve roto. */
    const afuera = ['/', '/verificar', '/api', '/robots.txt', '/favicon', '/logo', '/_astro', '/apple-touch'];
    const esRaiz = ctx.url.pathname === '/';
    if (!esRaiz && !afuera.some((r) => r !== '/' && ctx.url.pathname.startsWith(r))) {
      return ctx.redirect('/sistema/entrar', 302);
    }
  }

  if (vieneDeAfuera(ctx.request)) {
    return new Response('Origen no permitido', { status: 403 });
  }

  const ruta = ctx.url.pathname;

  if (!ruta.startsWith('/sistema')) {
    const respuesta = await siguiente();
    /* La medición va después de tener la respuesta y sin esperarla: una
       página pública que no abre por culpa de su propia analítica es un
       error grave; perder un conteo, no. El detalle está en visitas.ts. */
    medirPaginaPublica(ctx, respuesta);
    return respuesta;
  }

  // Las rutas de Better Auth se atienden solas.
  if (ruta.startsWith('/sistema/auth')) return siguiente();

  const sesion = await auth.api.getSession({ headers: ctx.request.headers });
  const usuario = sesion?.user ?? null;
  ctx.locals.usuario = usuario && usuario.activo !== false ? usuario : null;

  /* La pantalla del código del segundo factor es parte de entrar: quien
     está ahí ya puso su clave bien, pero todavía no tiene sesión. Si
     pidiera sesión, mandaría al login y de ahí otra vez al código, en
     círculo. */
  const esEntrar = ruta === '/sistema/entrar' || ruta === '/sistema/entrar/'
    || ruta === '/sistema/codigo' || ruta === '/sistema/codigo/';
  if (!ctx.locals.usuario && !esEntrar) {
    /* A una pantalla se la manda al login; a una llamada de datos se le
       contesta 401. Redirigir una llamada de fetch devuelve el HTML de la
       pantalla de entrar con estado 200, y del otro lado eso llega como un
       JSON que no se puede leer: el panel decía «sin conexión con el
       servidor» cuando lo que pasó fue que se venció la sesión. */
    if (ruta.startsWith('/sistema/api/')) {
      return new Response('Sin sesión', { status: 401 });
    }
    return ctx.redirect('/sistema/entrar');
  }
  if (ctx.locals.usuario && esEntrar) {
    return ctx.redirect(dondeEmpieza(ctx.locals.usuario.rol as string));
  }

  const respuesta = await siguiente();
  // El sistema no se indexa nunca, pase lo que pase con robots.txt.
  respuesta.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return respuesta;
});
