/**
 * Fuente única de datos de Atenmefa.
 *
 * Todo lo que se muestra en el sitio sale de acá: textos, schema.org, enlaces.
 * Cambiar un dato una vez lo cambia en la página, en los datos estructurados
 * y en el pie, sin tocar nada más.
 *
 * Los campos marcados `null` todavía no los confirmó el cliente. Mientras sigan
 * en null la sección correspondiente NO se muestra: preferimos un hueco a
 * publicar un horario o un precio inventado, que es lo que genera reseñas malas
 * y lo que Google castiga en sitios de salud.
 */

export type Pendiente<T> = T | null;

export const clinica = {
  nombre: 'Atenmefa',
  nombreLargo: 'Atenmefa — Atención Médica Familiar',
  descripcionCorta:
    'Centro de atención médica familiar y traslados en ambulancia en Ciudad Bolívar.',

  /** Cambiar cuando se defina el dominio final. De acá salen canonical, og:url y schema. */
  dominio: 'https://atenmefa.site',

  direccion: {
    calle: 'Av. Principal de La Sabanita, C.C. Santa Catalina, Local 04',
    sector: 'La Sabanita',
    ciudad: 'Ciudad Bolívar',
    estado: 'Bolívar',
    pais: 'VE',
    /**
     * POR CONFIRMAR con el cliente. Vienen de OpenStreetMap buscando
     * "C.C. Santa Catalina, Ciudad Bolívar": el registro existe, pero lo
     * sitúa en Avenida Sucre, sector Puente Gómez, Sabanita Viejo, y la
     * dirección que dio el cliente dice "Av. Principal de La Sabanita".
     * Puede ser el mismo sitio con dos nombres, o puede estar mal.
     * Pedir que abran Google Maps en el local y manden el punto.
     */
    lat: 8.1224846 as Pendiente<number>,
    lng: -63.556518 as Pendiente<number>,
    /** PENDIENTE: enlace a la ficha de Google Business, no a una búsqueda. */
    fichaGoogle: null as Pendiente<string>,
  },

  contacto: {
    /**
     * Hay UNA sola línea, y es la misma para llamar y para WhatsApp.
     * No existe un número aparte de emergencias: no presentarlo como si
     * lo hubiera. Si el cliente consigue un fijo o una línea dedicada,
     * se agrega acá y la página se reorganiza sola.
     */
    whatsapp: { e164: '+584148939176', visible: '0414-893.91.76' },
    /** PENDIENTE: teléfono fijo del local. Para emergencias hace falta un fijo. */
    fijo: null as Pendiente<{ e164: string; visible: string }>,
    /** PENDIENTE: correo propio del dominio. El Gmail resta confianza. */
    correo: 'atenmefa1@gmail.com',
    instagram: 'atenmefa',
  },

  /**
   * PENDIENTE: horarios reales, por día.
   * Formato schema.org: ['Mo-Fr 08:00-17:00', 'Sa 08:00-12:00']
   */
  horarios: null as Pendiente<string[]>,
  horariosTexto: null as Pendiente<string>,

  /** PENDIENTE: ¿la ambulancia es de verdad 24/7? La subpágina lo promete y el sitio no lo sostiene. */
  ambulancia24h: null as Pendiente<boolean>,

  /** Formas de pago como funcionan en Venezuela. */
  pagos: ['Pago móvil', 'Transferencia en bolívares', 'Punto de venta', 'Divisas en efectivo'],

  /** Redes y perfiles que confirman la identidad del negocio (sameAs en schema). */
  perfiles: ['https://instagram.com/atenmefa'],
} as const;

/**
 * El equipo. Esto es lo que decide si Google y Gemini citan al sitio:
 * en salud no basta con decir "profesionales capacitados", hay que decir quién.
 */
export const equipo: {
  nombre: string;
  titulo: string;
  especialidad: Pendiente<string>;
  cm: Pendiente<string>;
  msds: Pendiente<string>;
  rol: string;
}[] = [
  /**
   * PENDIENTE: quiénes atienden en Atenmefa.
   *
   * Va vacío a propósito. El nombre que trae la papelería del cliente es el
   * del médico que firmó un caso de Grupo Nueve Once, donde Atenmefa figura
   * como proveedor: puede ser personal de la red y no de la clínica.
   * Hasta que el cliente confirme nombre, especialidad y colegiatura de SU
   * personal, la sección no publica a nadie.
   *
   * Importa más que ningún otro dato: en salud, Google y los buscadores con
   * IA no citan a "profesionales capacitados", citan a alguien con nombre y
   * credencial verificable.
   */
];

/**
 * Servicios. Cada uno es una página futura (/servicios/<slug>), que es donde
 * está el tráfico que hoy no llega: nadie busca "centro médico", buscan
 * "dónde hacerme un electrocardiograma en Ciudad Bolívar".
 *
 * `precioDesde` en null = no se muestra precio. Pedirlos al cliente.
 */
export const servicios = [
  {
    slug: 'traslados-en-ambulancia',
    nombre: 'Traslados en ambulancia',
    resumen:
      'Unidades con soporte vital y personal paramédico, dentro de Ciudad Bolívar y hacia cualquier estado del país.',
    detalle:
      'Traslado de pacientes entre domicilio, clínica y hospital, y traslados de larga distancia fuera del estado Bolívar.',
    cobertura: 'Nacional',
    destacado: true,
    precioDesde: null as Pendiente<string>,
  },
  {
    slug: 'emergencias',
    nombre: 'Atención de emergencias',
    resumen: 'Atención inmediata en el local, con evaluación y estabilización del paciente.',
    detalle: null as Pendiente<string>,
    cobertura: 'Ciudad Bolívar',
    destacado: true,
    precioDesde: null as Pendiente<string>,
  },
  {
    slug: 'consulta-medica',
    nombre: 'Consulta médica',
    resumen: 'Consulta de medicina familiar para adultos y niños, con historia clínica completa.',
    detalle: null as Pendiente<string>,
    cobertura: 'Ciudad Bolívar',
    destacado: false,
    precioDesde: null as Pendiente<string>,
  },
  {
    slug: 'laboratorio-clinico',
    nombre: 'Laboratorio clínico',
    resumen: 'Hematología completa, química sanguínea, orina, heces y perfiles de rutina.',
    detalle: null as Pendiente<string>,
    cobertura: 'Ciudad Bolívar',
    destacado: true,
    precioDesde: null as Pendiente<string>,
  },
  {
    slug: 'electrocardiograma',
    nombre: 'Electrocardiograma',
    resumen: 'Electrocardiograma de reposo con informe del médico.',
    detalle: null as Pendiente<string>,
    cobertura: 'Ciudad Bolívar',
    destacado: false,
    precioDesde: null as Pendiente<string>,
  },
  {
    slug: 'nebulizacion',
    nombre: 'Nebulización',
    resumen: 'Terapia respiratoria en el local, para adultos y niños.',
    detalle: null as Pendiente<string>,
    cobertura: 'Ciudad Bolívar',
    destacado: false,
    precioDesde: null as Pendiente<string>,
  },
  {
    slug: 'cirugia-menor',
    nombre: 'Cirugía menor ambulatoria',
    resumen: 'Suturas, drenajes y procedimientos menores sin hospitalización.',
    detalle: null as Pendiente<string>,
    cobertura: 'Ciudad Bolívar',
    destacado: false,
    precioDesde: null as Pendiente<string>,
  },
  {
    slug: 'alquiler-de-equipos',
    nombre: 'Alquiler de equipos médicos',
    resumen: 'Equipos para cuidado en casa: sillas de ruedas, camas, oxígeno y más.',
    detalle: null as Pendiente<string>,
    cobertura: 'Ciudad Bolívar',
    destacado: false,
    precioDesde: null as Pendiente<string>,
  },
] as const;

/**
 * Preguntas frecuentes.
 *
 * Esta es la palanca principal de AEO: Gemini y las respuestas de IA citan
 * pares pregunta/respuesta porque se pueden recortar y siguen teniendo sentido.
 * Regla al escribirlas: la respuesta arranca contestando, en una o dos frases,
 * sin "en Atenmefa entendemos que".
 *
 * `respuesta: null` = la pregunta existe pero falta el dato. No se publica.
 */
export const preguntas = [
  {
    pregunta: '¿Dónde queda Atenmefa en Ciudad Bolívar?',
    respuesta:
      'Atenmefa está en la Av. Principal de La Sabanita, dentro del C.C. Santa Catalina, local 04, en Ciudad Bolívar, estado Bolívar.',
  },
  {
    pregunta: '¿Hacen traslados en ambulancia fuera del estado Bolívar?',
    respuesta:
      'Sí. Atenmefa hace traslados a cualquier estado del país, en unidades con soporte vital y personal paramédico a bordo durante todo el trayecto.',
  },
  {
    pregunta: '¿Trabajan con seguros?',
    respuesta:
      'Sí. Atenmefa atiende casos de seguros y de redes de asistencia médica. Para saber si su póliza aplica, escriba por WhatsApp con el nombre del seguro antes de la consulta.',
  },
  {
    pregunta: '¿Qué formas de pago aceptan?',
    respuesta:
      'Pago móvil, transferencia en bolívares, punto de venta y divisas en efectivo.',
  },
  {
    pregunta: '¿Necesito orden médica para hacerme exámenes de laboratorio?',
    respuesta: null as Pendiente<string>,
  },
  {
    pregunta: '¿Atienden emergencias las 24 horas?',
    respuesta: null as Pendiente<string>,
  },
  {
    pregunta: '¿Cuánto cuesta un traslado en ambulancia?',
    respuesta: null as Pendiente<string>,
  },
  {
    pregunta: '¿Cuándo están listos los resultados del laboratorio?',
    respuesta: null as Pendiente<string>,
  },
  {
    pregunta: '¿Hay que ir en ayunas para los exámenes de sangre?',
    respuesta: null as Pendiente<string>,
  },
  {
    pregunta: '¿Atienden niños?',
    respuesta: null as Pendiente<string>,
  },
] as const;

/** Solo las que tienen respuesta confirmada llegan a la página y al schema. */
export const preguntasPublicables = preguntas.filter(
  (p): p is (typeof preguntas)[number] & { respuesta: string } => p.respuesta !== null,
);

export const serviciosDestacados = servicios.filter((s) => s.destacado);

export const wa = (mensaje: string) =>
  `https://wa.me/${clinica.contacto.whatsapp.e164.replace('+', '')}?text=${encodeURIComponent(mensaje)}`;
