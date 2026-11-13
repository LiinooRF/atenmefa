/**
 * Lectura del rango de fechas que viene en la dirección.
 *
 * Acepta dos formas: `?desde=&hasta=` del rango libre, y `?d=desde|hasta`
 * que mandan los atajos en un solo botón. Si llega cualquier cosa, se cae
 * al mes en curso en vez de romperse.
 */
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const hoyEnCaracas = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

export function rangoDesdeUrl(url: URL) {
  const hoy = hoyEnCaracas();
  let desde = url.searchParams.get('desde') ?? '';
  let hasta = url.searchParams.get('hasta') ?? '';

  const atajo = url.searchParams.get('d');
  if (atajo?.includes('|')) {
    const [a, b] = atajo.split('|');
    desde = a; hasta = b;
  }

  /* Compatibilidad con los enlaces viejos que mandaban ?mes=YYYY-MM. */
  const mes = url.searchParams.get('mes');
  if (!desde && !hasta && mes && /^\d{4}-\d{2}$/.test(mes)) {
    desde = `${mes}-01`;
    const fin = new Date(`${mes}-01T12:00:00`);
    fin.setMonth(fin.getMonth() + 1);
    fin.setDate(0);
    hasta = fin.toISOString().slice(0, 10);
  }

  if (!ES_FECHA.test(desde) || !ES_FECHA.test(hasta)) {
    desde = `${hoy.slice(0, 7)}-01`;
    hasta = hoy;
  }

  // Si vienen al revés, se dan vuelta: es un error de dedo, no un error.
  if (desde > hasta) [desde, hasta] = [hasta, desde];

  return { desde, hasta };
}

export function nombreDelRango(desde: string, hasta: string) {
  const f = (s: string, opciones: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('es-VE', opciones).format(new Date(`${s}T12:00:00`));

  if (desde === hasta) return f(desde, { day: 'numeric', month: 'long', year: 'numeric' });

  const mismoAnio = desde.slice(0, 4) === hasta.slice(0, 4);
  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7);

  /* Un mes entero se nombra por el mes, no por sus dos extremos: "octubre
     de 2026" se lee mejor que "del 1 al 31 de octubre". */
  const fin = new Date(`${desde}T12:00:00`);
  fin.setMonth(fin.getMonth() + 1);
  fin.setDate(0);
  if (desde.endsWith('-01') && hasta === fin.toISOString().slice(0, 10)) {
    return f(desde, { month: 'long', year: 'numeric' });
  }

  if (mismoMes) {
    return `del ${desde.slice(-2)} al ${hasta.slice(-2)} de ${f(hasta, { month: 'long', year: 'numeric' })}`;
  }
  return mismoAnio
    ? `del ${f(desde, { day: 'numeric', month: 'short' })} al ${f(hasta, { day: 'numeric', month: 'long', year: 'numeric' })}`
    : `del ${f(desde, { day: 'numeric', month: 'short', year: 'numeric' })} al ${f(hasta, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/**
 * Años cumplidos entre dos fechas date de Postgres, que llegan como
 * 'YYYY-MM-DD'.
 *
 * Se comparan año, mes y día como números y no con new Date() + toISOString:
 * una fecha date de la base no es un instante sino un día, y convertirla a
 * Date la arrastra a una zona horaria donde puede amanecer un día antes o
 * después. El cumpleaños es el cumpleaños en cualquier zona.
 */
export function aniosCumplidos(nacimiento: string, hasta: string): number {
  const [na, nm, nd] = nacimiento.split('-').map(Number);
  const [ha, hm, hd] = hasta.split('-').map(Number);
  let anios = ha - na;
  /* Todavía no cumplió: hasta el día antes es un año menos. */
  if (hm < nm || (hm === nm && hd < nd)) anios--;
  return anios;
}
