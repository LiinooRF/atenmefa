/**
 * Qué ícono le toca a cada servicio.
 *
 * Vivía dentro de Servicios.astro y ahora lo necesitan dos pantallas: el
 * índice de la portada y la lámina de la página de cada servicio. Un
 * servicio nuevo sin entrada acá cae en el ícono genérico en vez de
 * romper la página.
 */
export const ICONO_DE_SERVICIO: Record<string, string> = {
  'traslados-en-ambulancia': 'ambulancia',
  emergencias: 'latido',
  'consulta-medica': 'estetoscopio',
  'laboratorio-clinico': 'laboratorio',
  electrocardiograma: 'latido',
  nebulizacion: 'pulmon',
  'cirugia-menor': 'bisturi',
  'alquiler-de-equipos': 'silla',
  ecosonografias: 'latido',
  'atencion-a-domicilio': 'estetoscopio',
  'examenes-ocupacionales': 'recibo',
  'medicina-deportiva': 'latido',
};

export const iconoDe = (slug: string) => ICONO_DE_SERVICIO[slug] ?? 'estetoscopio';
