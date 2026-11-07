/**
 * Medición del sitio público: lo que se registra y lo que se consulta.
 *
 * Este archivo tiene dos mitades bien separadas:
 *
 *   1. REGISTRO. Lo usan el middleware (páginas que el servidor arma en el
 *      momento) y /api/v (el resto). Nunca guarda nada que identifique a
 *      una persona; el porqué está escrito en base/003-visitas.sql y manda
 *      sobre cualquier comodidad de acá.
 *
 *   2. CONSULTAS, para la pantalla de administración. Todas reciben el
 *      rango como dos fechas YYYY-MM-DD, ambas incluidas, y se calculan en
 *      Postgres. Traer las filas al servidor para sumarlas acá funciona la
 *      primera semana y se cae cuando el sitio lleve un año midiendo.
 *
 * CONTRATO PARA QUIEN ARME LA PANTALLA
 *
 *   const m = await medicionDelSitio(desde, hasta);
 *
 * devuelve todo de una sola vez (las consultas salen en paralelo) y es lo
 * único que hace falta llamar. Si se quiere una sola cosa, cada consulta
 * está exportada aparte con el mismo nombre que su campo.
 *
 * DOS ADVERTENCIAS QUE HAY QUE REFLEJAR EN LA PANTALLA, NO ESCONDER
 *
 *   · `unicos` en un rango de varios días es la suma de los visitantes
 *     distintos de CADA día, no personas distintas: la huella rota todos
 *     los días a propósito para no poder seguir a nadie. Quien entró lunes
 *     y martes cuenta dos veces. Decirlo en una nota al pie es parte del
 *     trabajo; presentarlo como "personas" sería mentir.
 *   · `pais` puede venir vacío: solo se llena si el proxy manda la
 *     cabecera. En local siempre es nulo.
 */
import { createHmac } from 'node:crypto';
import type { APIContext } from 'astro';
import { sql } from 'drizzle-orm';
import { bd } from './base';
import { exigido } from './entorno';
import { hoyEnCaracas } from './fechas';
import {
  visita, evento, type TipoDeEvento, type Dispositivo,
} from '../base/visitas-esquema';

/* ───────────────────────── 1. REGISTRO ───────────────────────── */

/**
 * Las acciones que el navegador tiene permitido reportar. Lista cerrada:
 * lo que llegue fuera de acá se descarta sin guardar nada. 'ver_servicio'
 * no está porque no lo manda el navegador, lo deduce el servidor de la
 * ruta, y así su detalle no puede ser texto ajeno.
 */
export const ACCIONES_DEL_NAVEGADOR = [
  'llamar', 'whatsapp', 'como_llegar', 'instagram', 'correo',
] as const satisfies readonly TipoDeEvento[];

export type AccionDelNavegador = (typeof ACCIONES_DEL_NAVEGADOR)[number];

export const esAccionDelNavegador = (valor: unknown): valor is AccionDelNavegador =>
  typeof valor === 'string'
  && (ACCIONES_DEL_NAVEGADOR as readonly string[]).includes(valor);

/**
 * Lo que cuenta como contacto, que es la pregunta del cliente: ¿cuántos de
 * los que entraron nos escribieron o nos llamaron?
 *
 * 'ver_servicio' queda AFUERA a propósito. Ese evento lo escribe el
 * servidor solo porque alguien abrió la página de un servicio: es la misma
 * página vista que ya está en `visita`, no una acción. Contándolo, quien
 * mira "Laboratorio clínico" y se va figura como contacto y la conversión
 * se va al 90% sin que suene un teléfono.
 *
 * Es una lista aparte de ACCIONES_DEL_NAVEGADOR aunque hoy coincidan los
 * nombres: una dice qué puede reportar el navegador y la otra qué vale como
 * contacto. Un evento nuevo obliga a decidir en los dos lados.
 */
export const EVENTOS_DE_CONTACTO = [
  'llamar', 'whatsapp', 'como_llegar', 'instagram', 'correo',
] as const satisfies readonly TipoDeEvento[];

/** Nombres para la pantalla. El enum de la base es para la base. */
export const ROTULO_EVENTO: Record<TipoDeEvento, string> = {
  llamar: 'Tocó llamar',
  whatsapp: 'Escribió por WhatsApp',
  como_llegar: 'Pidió cómo llegar',
  ver_servicio: 'Abrió un servicio',
  instagram: 'Fue al Instagram',
  correo: 'Escribió un correo',
};

/**
 * Lo que se puede saber de una petición sin guardar nada identificable.
 * Nótese lo que NO está: la IP. Entra al cálculo de la huella y se
 * descarta en el mismo paso.
 */
export interface Senas {
  ruta: string;
  referente: string | null;
  dispositivo: Dispositivo;
  navegador: string | null;
  pais: string | null;
  huella: string;
}

/**
 * Un navegador siempre se presenta, así que el user-agent vacío también
 * cuenta como rastreador. La lista no pretende ser completa —es una
 * carrera que no se gana— sino quitar el grueso, que es lo que distorsiona
 * los números.
 */
const RASTREADORES =
  /bot|crawl|spider|slurp|scrap|fetch|monitor|uptime|pingdom|preview|embed|headless|lighthouse|pagespeed|facebookexternalhit|whatsapp\/|curl|wget|python|java|go-http|okhttp|axios|libwww|httpclient|phantom|semrush|ahrefs|dataprovider/i;

export const esRastreador = (agente: string) =>
  agente.trim().length === 0 || RASTREADORES.test(agente);

/**
 * La IP solo existe dentro de esta función y de la huella: entra, se
 * mezcla con la sal del día y se va. No se devuelve, no se registra en
 * ninguna parte y no hay columna donde pudiera caer por descuido.
 */
function ipDeLaPeticion(pedido: Request, directa: string): string {
  const reenviada = pedido.headers.get('x-forwarded-for')?.split(',')[0];
  return (
    pedido.headers.get('cf-connecting-ip')
    ?? pedido.headers.get('x-real-ip')
    ?? reenviada
    ?? directa
    ?? ''
  ).trim();
}

/**
 * Identificador de visitante que caduca a medianoche.
 *
 * La sal es AUTH_SECRETO más la fecha de hoy en Caracas. Mañana el mismo
 * visitante da otra huella, así que nadie puede seguirlo de un día al otro,
 * y con la base de datos sola estas huellas no llevan a ninguna parte.
 * OJO con lo que NO cumple: AUTH_SECRETO es permanente y la fecha es
 * pública, así que quien tenga el .env puede rehacer la sal de cualquier día
 * y, desde ahí, llegar a la IP por fuerza bruta. Para que eso tampoco se
 * pueda, la sal tendría que ser aleatoria, guardada aparte y borrada a los
 * pocos días. Hoy no lo es: se explica entero en 003-visitas.sql
 * para probarla contra una IP, ni cruzar los dos días para armar el
 * recorrido de una persona.
 */
export function huellaDelDia(ip: string, agente: string): string {
  const sal = `${hoyEnCaracas()}:${exigido('AUTH_SECRETO', 'cadena larga y aleatoria')}`;
  return createHmac('sha256', sal).update(`${ip}|${agente}`).digest('hex').slice(0, 32);
}

/** iPad y los Android sin "Mobile" son tabletas; el resto, el reparto normal. */
function dispositivoDe(agente: string): Dispositivo {
  if (/ipad|tablet|playbook|silk|kindle/i.test(agente)) return 'tablet';
  if (/android/i.test(agente) && !/mobile/i.test(agente)) return 'tablet';
  if (/mobile|iphone|ipod|phone|iemobile|blackberry|opera mini/i.test(agente)) return 'movil';
  return 'escritorio';
}

/**
 * El orden de esta lista es lo único que la hace funcionar: Edge y Opera
 * también dicen "Chrome", y Chrome también dice "Safari". Lo que no se
 * reconoce queda nulo; no se inventa un nombre.
 */
const NAVEGADORES: readonly [RegExp, string][] = [
  [/edg[ea]?\//i, 'Edge'],
  [/opr\/|opera/i, 'Opera'],
  [/samsungbrowser/i, 'Samsung Internet'],
  [/firefox|fxios/i, 'Firefox'],
  [/chrome|crios|chromium/i, 'Chrome'],
  [/safari/i, 'Safari'],
];

function navegadorDe(agente: string): string | null {
  for (const [patron, nombre] of NAVEGADORES) if (patron.test(agente)) return nombre;
  return null;
}

/**
 * El país se acepta solo si lo manda el proxy. XX y T1 son los comodines
 * de Cloudflare para "no sé" y para Tor: valen lo mismo que nada.
 */
function paisDe(pedido: Request): string | null {
  const crudo = (
    pedido.headers.get('cf-ipcountry')
    ?? pedido.headers.get('x-vercel-ip-country')
    ?? pedido.headers.get('x-country-code')
    ?? ''
  ).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(crudo) || crudo === 'XX' || crudo === 'T1') return null;
  return crudo;
}

/**
 * De dónde viene la visita: SOLO el dominio.
 *
 * Acepta una URL completa (la cabecera Referer) o un dominio suelto (lo
 * que reporta el navegador). Se queda con el anfitrión, en minúsculas y
 * sin "www.", y exige que tenga la forma de un dominio: así lo que se
 * guarda no puede ser una dirección con la búsqueda de alguien dentro, ni
 * texto libre que después se pinte en una pantalla.
 *
 * El propio dominio devuelve nulo: moverse dentro del sitio no es venir
 * de ninguna parte.
 */
function dominioDe(valor: string | null | undefined, propio: string): string | null {
  if (!valor) return null;
  let anfitrion = valor.trim().toLowerCase();
  if (anfitrion.includes('/') || anfitrion.includes(':')) {
    try {
      anfitrion = new URL(
        anfitrion.includes('://') ? anfitrion : `https://${anfitrion}`,
      ).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
  /* l.instagram.com, l.facebook.com y lm.facebook.com son las puertas de
     salida de Meta, y m.<algo> es la versión móvil del mismo sitio. Son el
     mismo origen: dejarlos como dominios distintos parte el canal más
     importante de la clínica en varias filas y hace ver a Instagram más
     chico de lo que es. El prefijo se quita solo si lo que queda sigue
     siendo un dominio, para no convertir m.me en "me". */
  const sinPrefijo = anfitrion.replace(/^(www|l|lm|m)\./, '');
  if (sinPrefijo.includes('.')) anfitrion = sinPrefijo;
  if (!/^[a-z0-9.-]{4,120}$/.test(anfitrion)) return null;
  if (!anfitrion.includes('.')) return null;
  if (anfitrion === propio) return null;
  return anfitrion;
}

/**
 * Deja la ruta en una sola forma. Sin esto, /servicios/emergencias y
 * /servicios/emergencias/ son dos filas distintas y el informe de páginas
 * más vistas parte cada página en pedazos.
 */
export function rutaNormalizada(camino: string): string {
  let r = (camino.split('?')[0] ?? '').split('#')[0] ?? '';
  r = r.replace(/\/{2,}/g, '/');
  if (!r.startsWith('/')) r = `/${r}`;
  if (r.length > 1) r = r.replace(/\/+$/, '');
  return r.slice(0, 160).toLowerCase();
}

/**
 * Reúne lo medible de una petición. Devuelve null cuando no hay que medir
 * (rastreador), para que quien llame no tenga que acordarse de preguntar.
 *
 * `referenteCrudo` es para /api/v: en ese caso la cabecera Referer apunta
 * a nuestra propia página —el aviso lo manda la página— así que el
 * referente de verdad lo tiene que reportar el navegador.
 */
export function senasDe(
  ctx: APIContext,
  ruta: string,
  referenteCrudo?: string | null,
): Senas | null {
  const agente = ctx.request.headers.get('user-agent') ?? '';
  if (esRastreador(agente)) return null;

  /* clientAddress revienta si la ruta es prerenderizada; detrás del proxy
     tampoco sirve. Es el último recurso, no el primero. */
  let directa = '';
  try {
    directa = ctx.clientAddress ?? '';
  } catch {
    directa = '';
  }

  const propio = ctx.url.hostname.toLowerCase().replace(/^www\./, '');

  return {
    ruta: rutaNormalizada(ruta),
    referente: dominioDe(referenteCrudo ?? ctx.request.headers.get('referer'), propio),
    dispositivo: dispositivoDe(agente),
    navegador: navegadorDe(agente),
    pais: paisDe(ctx.request),
    huella: huellaDelDia(ipDeLaPeticion(ctx.request, directa), agente),
  };
}

/** Las páginas de servicio, de donde sale el evento 'ver_servicio'. */
const RUTA_DE_SERVICIO = /^\/servicios\/([a-z0-9-]{1,60})$/;

/**
 * Guarda una página vista. Si la página es la de un servicio, deja además
 * el evento: que alguien abra "Laboratorio clínico" es interés concreto en
 * un servicio, no solo tráfico, y el cliente lo va a querer mirar junto a
 * las llamadas. El detalle sale de nuestra propia ruta ya normalizada.
 */
export async function registrarVisita(senas: Senas): Promise<void> {
  await bd.insert(visita).values({
    ruta: senas.ruta,
    referente: senas.referente,
    dispositivo: senas.dispositivo,
    navegador: senas.navegador,
    pais: senas.pais,
    huella: senas.huella,
  });

  const servicio = RUTA_DE_SERVICIO.exec(senas.ruta);
  if (servicio) {
    await registrarEvento('ver_servicio', senas, servicio[1]!);
  }
}

/** Guarda una acción. El detalle lo pone el servidor, nunca el navegador. */
export async function registrarEvento(
  tipo: TipoDeEvento,
  senas: Senas,
  detalle: string | null = null,
): Promise<void> {
  await bd.insert(evento).values({
    tipo,
    detalle,
    ruta: senas.ruta,
    huella: senas.huella,
  });
}

/* Lo que nunca es una visita: lo del sistema, los endpoints y todo lo que
   tenga extensión (robots.txt, sitemap-0.xml, las imágenes, _astro). */
const NO_SE_MIDE = /^\/(_astro|_image|_server-islands|api|sistema)(\/|$)/;
const PARECE_ARCHIVO = /\.[a-z0-9]{1,8}$/i;

/**
 * La misma regla para las dos puntas. El middleware la aplica sobre la ruta
 * que pidió el navegador; /api/v sobre la que reporta la página, que viene
 * de afuera y por eso no se puede creer sin más: sin esto, un aviso armado
 * a mano mete /sistema/pacientes o /wp-login.php en el informe de páginas
 * más vistas.
 */
export const esRutaDeVisita = (ruta: string): boolean =>
  !NO_SE_MIDE.test(ruta) && !PARECE_ARCHIVO.test(ruta);

/**
 * Las tres condiciones: GET de una página HTML del sitio público, que no
 * venga de un rastreador, y sin retrasar la respuesta.
 *
 * `isPrerendered` es la que no se ve venir: el middleware TAMBIÉN corre
 * durante `pnpm build`, cuando se arman las páginas estáticas. Sin este
 * corte, cada compilación metería una visita falsa por página.
 */
function hayQueMedir(ctx: APIContext, respuesta: Response): boolean {
  if (ctx.isPrerendered) return false;
  if (ctx.request.method !== 'GET') return false;

  if (!esRutaDeVisita(ctx.url.pathname)) return false;

  /* Una petición de datos desde el JavaScript de la página no es una
     visita; solo cuenta lo que el navegador pidió como documento. */
  if (!(ctx.request.headers.get('accept') ?? '').includes('text/html')) return false;

  if (respuesta.status !== 200) return false;
  return (respuesta.headers.get('content-type') ?? '').includes('text/html');
}

/**
 * Punto de entrada del middleware.
 *
 * No devuelve promesa a propósito: la escritura sale sin await y con el
 * error atrapado. Una página pública que no abre porque su propia
 * analítica está lenta o porque Postgres se cayó es un error grave; perder
 * un conteo no lo es.
 *
 * Ojo con el alcance: en este proyecto las páginas públicas se
 * prerenderizan, y el adaptador de Node las sirve desde el disco sin pasar
 * por el middleware. Por eso esta función mide las páginas públicas que el
 * servidor arme en el momento (hoy ninguna; mañana, cualquiera que lleve
 * `prerender = false`) y las estáticas avisan por /api/v, que sí es una
 * ruta del servidor. Las dos puntas terminan en registrarVisita, y
 * `Astro.isPrerendered` decide cuál avisa, así que una visita no se cuenta
 * dos veces.
 */
export function medirPaginaPublica(ctx: APIContext, respuesta: Response): void {
  try {
    if (!hayQueMedir(ctx, respuesta)) return;
    const senas = senasDe(ctx, ctx.url.pathname);
    if (!senas) return;
    registrarVisita(senas).catch(() => {});
  } catch {
    /* Medir es lo último que importa en esta petición. */
  }
}

/* ───────────────────────── 2. CONSULTAS ───────────────────────── */

export interface Resumen {
  /** Páginas vistas en el rango. */
  visitas: number;
  /** Visitantes distintos. Ver la advertencia del encabezado. */
  unicos: number;
  /** Lo mismo en el tramo anterior del mismo largo, para comparar. */
  visitasAntes: number;
  unicosAntes: number;
}

export interface PuntoDelDia {
  /** YYYY-MM-DD. Vienen todos los días del rango, con cero donde no hubo nadie. */
  dia: string;
  visitas: number;
  unicos: number;
}

export interface PaginaVista {
  ruta: string;
  visitas: number;
  unicos: number;
}

export interface Reparto {
  /** Dispositivo, navegador, país u origen, según la consulta. */
  nombre: string;
  visitas: number;
}

export interface EventoContado {
  tipo: TipoDeEvento;
  /** Nombre para la pantalla, ya resuelto. */
  rotulo: string;
  veces: number;
  /** Visitantes distintos que lo hicieron, no repeticiones. */
  personas: number;
}

export interface Conversion {
  /** Visitantes distintos en el rango. */
  visitantes: number;
  /**
   * De esos, los que nos contactaron: llamada, WhatsApp, cómo llegar,
   * Instagram o correo. Abrir la página de un servicio NO cuenta.
   */
  actuaron: number;
  /** Ya redondeado a un decimal; 0 cuando no hubo visitas. */
  porcentaje: number;
}

export interface Medicion extends Resumen {
  desde: string;
  hasta: string;
  dias: number;
  porDia: PuntoDelDia[];
  paginas: PaginaVista[];
  origenes: Reparto[];
  dispositivos: Reparto[];
  navegadores: Reparto[];
  paises: Reparto[];
  eventos: EventoContado[];
  conversion: Conversion;
}

/**
 * El rango de fechas, resuelto en la zona de la clínica y comparando
 * contra la columna sin transformarla, que es lo que permite usar el
 * índice de momento. Escrito como `(momento AT TIME ZONE ...)::date
 * BETWEEN` se lee igual y obliga a recorrer la tabla entera.
 */
const tramo = (desde: string, hasta: string) => sql`
  momento >= timezone('America/Caracas', ${desde}::date::timestamp)
  AND momento < timezone('America/Caracas', (${hasta}::date + 1)::timestamp)
`;

const diasDelRango = (desde: string, hasta: string) =>
  Math.max(
    1,
    Math.round(
      (new Date(`${hasta}T12:00:00`).getTime() - new Date(`${desde}T12:00:00`).getTime())
        / 86_400_000,
    ) + 1,
  );

/* Mediodía en UTC para que sumar días no se tropiece con los cambios de
   hora: con 12 horas de margen a cada lado, el día nunca se corre. */
function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Un tope sano para los LIMIT que vienen de la pantalla. */
function limiteSano(limite: number, porOmision: number): number {
  if (!Number.isFinite(limite)) return porOmision;
  return Math.min(Math.max(Math.trunc(limite), 1), 50);
}

/**
 * Visitas y visitantes distintos, con el tramo inmediatamente anterior del
 * mismo largo para comparar: contra una semana no se compara un mes.
 *
 * Los dos tramos se cuentan en una sola pasada con FILTER, y el WHERE de
 * afuera los acota a los dos juntos —son contiguos— para no recorrer toda
 * la tabla.
 */
export async function visitasYUnicos(desde: string, hasta: string): Promise<Resumen> {
  const dias = diasDelRango(desde, hasta);
  const antesDesde = sumarDias(desde, -dias);
  const antesHasta = sumarDias(desde, -1);

  const [fila] = await bd.execute<{
    visitas: number; unicos: number; visitas_antes: number; unicos_antes: number;
  }>(sql`
    SELECT
      count(*) FILTER (WHERE ${tramo(desde, hasta)})::int AS visitas,
      count(DISTINCT huella) FILTER (WHERE ${tramo(desde, hasta)})::int AS unicos,
      count(*) FILTER (WHERE ${tramo(antesDesde, antesHasta)})::int AS visitas_antes,
      count(DISTINCT huella) FILTER (WHERE ${tramo(antesDesde, antesHasta)})::int
        AS unicos_antes
      FROM visita
     WHERE ${tramo(antesDesde, hasta)}
  `);

  return {
    visitas: fila?.visitas ?? 0,
    unicos: fila?.unicos ?? 0,
    visitasAntes: fila?.visitas_antes ?? 0,
    unicosAntes: fila?.unicos_antes ?? 0,
  };
}

/** Una fila por día, con cero donde no hubo nadie: un gráfico sin los días
 *  vacíos miente sobre el ritmo. */
export async function porDia(desde: string, hasta: string): Promise<PuntoDelDia[]> {
  const filas = await bd.execute<{ dia: string; visitas: number; unicos: number }>(sql`
    SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia,
           count(v.id)::int AS visitas,
           count(DISTINCT v.huella)::int AS unicos
      FROM generate_series(${desde}::date, ${hasta}::date, interval '1 day') AS d(dia)
      LEFT JOIN visita v
             ON (v.momento AT TIME ZONE 'America/Caracas')::date = d.dia::date
            AND ${tramo(desde, hasta)}
     GROUP BY d.dia
     ORDER BY d.dia
  `);
  return filas.map((f) => ({ dia: f.dia, visitas: f.visitas, unicos: f.unicos }));
}

/** Las páginas con más tráfico del rango. */
export async function paginasMasVistas(
  desde: string, hasta: string, limite = 10,
): Promise<PaginaVista[]> {
  const tope = limiteSano(limite, 10);
  const filas = await bd.execute<{ ruta: string; visitas: number; unicos: number }>(sql`
    SELECT ruta,
           count(*)::int AS visitas,
           count(DISTINCT huella)::int AS unicos
      FROM visita
     WHERE ${tramo(desde, hasta)}
     GROUP BY ruta
     ORDER BY visitas DESC, ruta
     LIMIT ${tope}
  `);
  return filas.map((f) => ({ ruta: f.ruta, visitas: f.visitas, unicos: f.unicos }));
}

/** De dónde llegan. "Directo" junta a quien escribió la dirección, llegó
 *  por un enlace guardado o desde una aplicación que no reporta origen. */
export async function deDondeVienen(
  desde: string, hasta: string, limite = 10,
): Promise<Reparto[]> {
  const tope = limiteSano(limite, 10);
  const filas = await bd.execute<{ nombre: string; visitas: number }>(sql`
    SELECT COALESCE(referente, 'Directo') AS nombre, count(*)::int AS visitas
      FROM visita
     WHERE ${tramo(desde, hasta)}
     GROUP BY COALESCE(referente, 'Directo')
     ORDER BY visitas DESC, nombre
     LIMIT ${tope}
  `);
  return filas.map((f) => ({ nombre: f.nombre, visitas: f.visitas }));
}

/** Los tres dispositivos siempre, incluso en cero: para el cliente importa
 *  tanto el número de móvil como saber que de escritorio no entra nadie. */
export async function porDispositivo(desde: string, hasta: string): Promise<Reparto[]> {
  const filas = await bd.execute<{ nombre: string; visitas: number }>(sql`
    SELECT d.nombre, count(v.id)::int AS visitas
      FROM (VALUES ('movil'), ('escritorio'), ('tablet')) AS d(nombre)
      LEFT JOIN visita v ON v.dispositivo::text = d.nombre AND ${tramo(desde, hasta)}
     GROUP BY d.nombre
     ORDER BY visitas DESC, d.nombre
  `);
  return filas.map((f) => ({ nombre: nombreDeDispositivo(f.nombre), visitas: f.visitas }));
}

const nombreDeDispositivo = (clave: string) =>
  clave === 'movil' ? 'Móvil' : clave === 'tablet' ? 'Tableta' : 'Escritorio';

/** Navegadores. Lo que no se pudo reconocer cae en "Otro". */
export async function porNavegador(desde: string, hasta: string): Promise<Reparto[]> {
  const filas = await bd.execute<{ nombre: string; visitas: number }>(sql`
    SELECT COALESCE(navegador, 'Otro') AS nombre, count(*)::int AS visitas
      FROM visita
     WHERE ${tramo(desde, hasta)}
     GROUP BY COALESCE(navegador, 'Otro')
     ORDER BY visitas DESC, nombre
  `);
  return filas.map((f) => ({ nombre: f.nombre, visitas: f.visitas }));
}

/**
 * Países, cuando el proxy los manda. Puede volver vacío entero y eso no es
 * un error: es que nadie nos dijo el país. La pantalla debería esconder el
 * bloque en ese caso, no mostrar un gráfico en blanco.
 */
export async function porPais(desde: string, hasta: string): Promise<Reparto[]> {
  const filas = await bd.execute<{ nombre: string; visitas: number }>(sql`
    SELECT pais AS nombre, count(*)::int AS visitas
      FROM visita
     WHERE ${tramo(desde, hasta)} AND pais IS NOT NULL
     GROUP BY pais
     ORDER BY visitas DESC, pais
     LIMIT 15
  `);
  return filas.map((f) => ({ nombre: f.nombre, visitas: f.visitas }));
}

/**
 * Qué hizo la gente. Vienen todos los tipos, también los que están en
 * cero: que nadie toque "cómo llegar" en un mes es justamente el dato.
 */
export async function eventosPorTipo(desde: string, hasta: string): Promise<EventoContado[]> {
  const filas = await bd.execute<{ tipo: TipoDeEvento; veces: number; personas: number }>(sql`
    SELECT tipo::text AS tipo,
           count(*)::int AS veces,
           count(DISTINCT huella)::int AS personas
      FROM evento
     WHERE ${tramo(desde, hasta)}
     GROUP BY tipo
  `);

  /* Los tipos que no aparecieron se completan en cero acá, sobre una lista
     de seis nombres. La cuenta sigue siendo de Postgres; esto es solo
     rellenar los huecos para que la pantalla no tenga que adivinarlos. */
  const contados = new Map(filas.map((f) => [f.tipo, f]));
  return (Object.keys(ROTULO_EVENTO) as TipoDeEvento[])
    .map((tipo) => ({
      tipo,
      rotulo: ROTULO_EVENTO[tipo],
      veces: contados.get(tipo)?.veces ?? 0,
      personas: contados.get(tipo)?.personas ?? 0,
    }))
    .sort((a, b) => b.veces - a.veces || a.rotulo.localeCompare(b.rotulo, 'es'));
}

/**
 * Cuántos de los que entraron nos contactaron.
 *
 * Dos recortes, y los dos cambian el número:
 *
 *   · solo los eventos de EVENTOS_DE_CONTACTO. 'ver_servicio' es una página
 *     vista que el servidor anota aparte, no una acción, y metido acá
 *     convierte a cualquier curioso en un contacto;
 *   · solo las huellas que además aparecen como visita: si un clic llegó y
 *     su página vista no (el aviso se pierde si el navegador se cierra
 *     antes), el porcentaje no se puede pasar del 100%.
 */
export async function conversion(desde: string, hasta: string): Promise<Conversion> {
  const deContacto = sql.join(EVENTOS_DE_CONTACTO.map((t) => sql`${t}`), sql`, `);

  const [fila] = await bd.execute<{ visitantes: number; actuaron: number }>(sql`
    WITH visitantes AS (
      SELECT DISTINCT huella FROM visita WHERE ${tramo(desde, hasta)}
    )
    SELECT
      (SELECT count(*)::int FROM visitantes) AS visitantes,
      (SELECT count(*)::int FROM visitantes v
        WHERE EXISTS (
          SELECT 1 FROM evento e
           WHERE e.huella = v.huella
             AND e.tipo::text IN (${deContacto})
             AND ${tramo(desde, hasta)}
        )) AS actuaron
  `);

  const visitantes = fila?.visitantes ?? 0;
  const actuaron = fila?.actuaron ?? 0;
  return {
    visitantes,
    actuaron,
    porcentaje: visitantes === 0 ? 0 : Math.round((actuaron / visitantes) * 1000) / 10,
  };
}

/**
 * Todo junto, que es lo que necesita la pantalla. Las consultas salen en
 * paralelo: son independientes y así la página no espera una suma de
 * esperas.
 */
export async function medicionDelSitio(desde: string, hasta: string): Promise<Medicion> {
  const [
    resumen, dia, paginas, origenes, dispositivos, navegadores, paises, eventos, conv,
  ] = await Promise.all([
    visitasYUnicos(desde, hasta),
    porDia(desde, hasta),
    paginasMasVistas(desde, hasta),
    deDondeVienen(desde, hasta),
    porDispositivo(desde, hasta),
    porNavegador(desde, hasta),
    porPais(desde, hasta),
    eventosPorTipo(desde, hasta),
    conversion(desde, hasta),
  ]);

  return {
    desde,
    hasta,
    dias: diasDelRango(desde, hasta),
    ...resumen,
    porDia: dia,
    paginas,
    origenes,
    dispositivos,
    navegadores,
    paises,
    eventos,
    conversion: conv,
  };
}
