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
    'Centro de atención médica familiar, servicios a domicilio y traslados en ambulancia en Ciudad Bolívar.',
  /** Del folleto: «Servicios de salud a domicilio». No estaba en el sitio. */
  aDomicilio: true,

  /** Cambiar cuando se defina el dominio final. De acá salen canonical, og:url y schema. */
  dominio: 'https://atenmefa.site',

  direccion: {
    /**
     * Del folleto propio del cliente. OJO: el sitio viejo decía
     * "Av. Principal de La Sabanita", que no coincide con su propia
     * papelería ni con el registro del C.C. Santa Catalina en
     * OpenStreetMap. Se usa la del folleto. Confirmar con el cliente:
     * una dirección distinta entre el sitio, el folleto y la ficha de
     * Google es de lo que más castiga el posicionamiento local.
     */
    calle: 'Av. Sucre, Sector Puente Gómez, C.C. Santa Catalina, Local 04',
    sector: 'Puente Gómez',
    ciudad: 'Ciudad Bolívar',
    estado: 'Bolívar',
    pais: 'VE',
    /**
     * De OpenStreetMap. Quedaron confirmadas: OSM ubica el C.C. Santa
     * Catalina en Avenida Sucre, sector Puente Gómez, y el folleto del
     * cliente dice exactamente esa dirección.
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
    /** Segunda línea del folleto. También es celular, no fijo. */
    segundo: { e164: '+584148517422', visible: '0414-851.74.22' },
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

  /** El folleto del cliente marca la línea 0414-893.91.76 como «24hrs». */
  ambulancia24h: true as Pendiente<boolean>,

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
export interface Servicio {
  slug: string;
  nombre: string;
  /** Título de la página del servicio. Es lo que se busca, no el nombre comercial. */
  titulo: string;
  resumen: string;
  /** Respuesta directa de dos frases. Es el párrafo que una IA puede citar. */
  entrada: string;
  cobertura: string;
  destacado: boolean;
  /** Qué incluye. Lo genérico se puede escribir; lo propio del centro, no. */
  incluye: readonly string[];
  /** PENDIENTE del cliente, cada uno. En null no se muestra. */
  precioDesde: Pendiente<string>;
  duracion: Pendiente<string>;
  preparacion: Pendiente<string>;
  entrega: Pendiente<string>;
  /** Preguntas propias del servicio. Sin respuesta no se publican. */
  preguntas: readonly { slug: string; pregunta: string; respuesta: Pendiente<string> }[];
}

export const servicios: readonly Servicio[] = [
  {
    slug: 'traslados-en-ambulancia',
    nombre: 'Traslados en ambulancia',
    titulo: 'Traslados en ambulancia desde Ciudad Bolívar',
    resumen:
      'Unidades con paramédico a bordo, dentro de Ciudad Bolívar y hacia cualquier estado del país.',
    entrada:
      'Atenmefa hace traslados en ambulancia desde Ciudad Bolívar hacia cualquier estado de Venezuela, con paramédico a bordo durante todo el trayecto. Se coordinan por teléfono o WhatsApp al 0414-893.91.76.',
    cobertura: 'Nacional',
    destacado: true,
    incluye: [
      'Traslado entre domicilio, clínica y hospital',
      'Traslados de larga distancia fuera del estado Bolívar',
      'Personal paramédico durante todo el trayecto',
      'Coordinación con la clínica o el hospital que recibe',
    ],
    precioDesde: null,
    duracion: null,
    preparacion: null,
    entrega: null,
    preguntas: [
      { slug: 'traslado-a-caracas', pregunta: '¿Cuánto cuesta un traslado de Ciudad Bolívar a Caracas?', respuesta: null },
      { slug: 'cuanto-tarda-la-ambulancia', pregunta: '¿Cuánto tardan en llegar dentro de Ciudad Bolívar?', respuesta: null },
      { slug: 'acompanante-en-la-ambulancia', pregunta: '¿Puede acompañar un familiar en la ambulancia?', respuesta: null },
      { slug: 'traslados-programados',
        pregunta: '¿Hacen traslados programados, no solo de emergencia?',
        respuesta: 'Sí. Además de las emergencias, Atenmefa coordina traslados programados: alta de una clínica, ingreso a otra, o viajes a otro estado para un tratamiento.' },
    ],
  },
  {
    slug: 'laboratorio-clinico',
    nombre: 'Laboratorio clínico',
    titulo: 'Laboratorio clínico en Ciudad Bolívar',
    resumen: 'Hematología, química sanguínea, orina, heces y perfiles de rutina.',
    entrada:
      'Atenmefa procesa exámenes de laboratorio en su local del C.C. Santa Catalina, en La Sabanita, Ciudad Bolívar. Incluye hematología completa, química sanguínea, orina y heces.',
    cobertura: 'Ciudad Bolívar',
    destacado: true,
    incluye: [
      'Hematología completa',
      'Química sanguínea: glicemia, urea, creatinina, perfil lipídico',
      'Examen de orina',
      'Examen de heces',
    ],
    precioDesde: null,
    duracion: null,
    preparacion: null,
    entrega: null,
    preguntas: [
      { slug: 'orden-medica-laboratorio', pregunta: '¿Necesito orden médica para hacerme exámenes?', respuesta: null },
      { slug: 'ayunas-laboratorio', pregunta: '¿Hay que ir en ayunas?', respuesta: null },
      { slug: 'resultados-laboratorio', pregunta: '¿Cuándo están listos los resultados?', respuesta: null },
      { slug: 'hora-de-muestras', pregunta: '¿Desde qué hora toman muestras?', respuesta: null },
    ],
  },
  {
    slug: 'emergencias',
    nombre: 'Atención de emergencias',
    titulo: 'Atención de emergencias en La Sabanita',
    resumen: 'Evaluación y estabilización en el local, con traslado si hace falta.',
    entrada:
      'Atenmefa atiende emergencias en su local de La Sabanita, en Ciudad Bolívar: evaluación, estabilización y traslado en su propia ambulancia si el caso lo requiere.',
    cobertura: 'Ciudad Bolívar',
    destacado: true,
    incluye: [
      'Evaluación y signos vitales',
      'Estabilización del paciente',
      'Tratamiento de urgencia',
      'Traslado en ambulancia propia si hace falta',
    ],
    precioDesde: null,
    duracion: null,
    preparacion: null,
    entrega: null,
    preguntas: [
      /* Las de "24 horas" y "a domicilio" viven en la lista general y no
         acá: son del centro entero, no de este servicio. Estaban en los dos
         lados, y la misma pregunta con la misma respuesta en dos FAQPage es
         contenido duplicado: Google termina ignorando las dos. */
    ],
  },
  {
    slug: 'consulta-medica',
    nombre: 'Consulta médica',
    titulo: 'Consulta de medicina familiar en Ciudad Bolívar',
    resumen: 'Medicina familiar para adultos y niños, con historia clínica completa.',
    entrada:
      'Atenmefa atiende consulta de medicina familiar para adultos y niños en el C.C. Santa Catalina, La Sabanita. Cada consulta queda registrada con historia clínica y récipe.',
    cobertura: 'Ciudad Bolívar',
    destacado: false,
    incluye: [
      'Evaluación y signos vitales',
      'Historia clínica',
      'Diagnóstico y récipe',
      'Indicación de exámenes si hacen falta',
    ],
    precioDesde: null,
    duracion: null,
    preparacion: null,
    entrega: null,
    preguntas: [
      { slug: 'atienden-ninos', pregunta: '¿Atienden niños?', respuesta: null },
      { slug: 'hay-que-pedir-cita-o', pregunta: '¿Hay que pedir cita o se atiende por orden de llegada?', respuesta: null },
    ],
  },
  {
    slug: 'electrocardiograma',
    nombre: 'Electrocardiograma',
    titulo: 'Electrocardiograma en Ciudad Bolívar',
    resumen: 'Electrocardiograma de reposo con informe del médico.',
    entrada:
      'Atenmefa hace electrocardiogramas de reposo con informe médico en su local de La Sabanita, Ciudad Bolívar. El estudio toma pocos minutos y no requiere preparación especial.',
    cobertura: 'Ciudad Bolívar',
    destacado: false,
    incluye: ['Electrocardiograma de reposo de 12 derivaciones', 'Informe del médico', 'Trazado impreso'],
    precioDesde: null,
    duracion: null,
    preparacion: null,
    entrega: null,
    preguntas: [
      { slug: 'necesito-orden-medica-para-un', pregunta: '¿Necesito orden médica para un electrocardiograma?', respuesta: null },
      { slug: 'me-entregan-el-informe-el', pregunta: '¿Me entregan el informe el mismo día?', respuesta: null },
    ],
  },
  {
    slug: 'nebulizacion',
    nombre: 'Nebulización',
    titulo: 'Nebulización en Ciudad Bolívar',
    resumen: 'Terapia respiratoria en el local, para adultos y niños.',
    entrada:
      'Atenmefa aplica nebulizaciones en su local de La Sabanita, Ciudad Bolívar, para adultos y niños, con el medicamento indicado por el médico.',
    cobertura: 'Ciudad Bolívar',
    destacado: false,
    incluye: ['Nebulización con el medicamento indicado', 'Evaluación antes y después', 'Adultos y niños'],
    precioDesde: null,
    duracion: null,
    preparacion: null,
    entrega: null,
    preguntas: [
      { slug: 'hay-que-llevar-el-medicamento', pregunta: '¿Hay que llevar el medicamento?', respuesta: null },
      { slug: 'cuantas-sesiones-hacen-falta', pregunta: '¿Cuántas sesiones hacen falta?', respuesta: null },
    ],
  },
  {
    slug: 'cirugia-menor',
    nombre: 'Cirugía menor ambulatoria',
    titulo: 'Cirugía menor ambulatoria en Ciudad Bolívar',
    resumen: 'Suturas, drenajes y procedimientos menores sin hospitalización.',
    entrada:
      'Atenmefa realiza procedimientos de cirugía menor ambulatoria en su local de La Sabanita: suturas, drenajes y curas, sin necesidad de hospitalización.',
    cobertura: 'Ciudad Bolívar',
    destacado: false,
    incluye: ['Sutura de heridas', 'Drenaje de abscesos', 'Curas y retiro de puntos'],
    precioDesde: null,
    duracion: null,
    preparacion: null,
    entrega: null,
    preguntas: [
      { slug: 'atienden-heridas-el-mismo-dia', pregunta: '¿Atienden heridas el mismo día?', respuesta: null },
      { slug: 'incluye-el-retiro-de-los', pregunta: '¿Incluye el retiro de los puntos?', respuesta: null },
    ],
  },
  {
    slug: 'alquiler-de-equipos',
    nombre: 'Alquiler de equipos médicos',
    titulo: 'Alquiler de equipos médicos en Ciudad Bolívar',
    resumen: 'Equipos para cuidado en casa: sillas de ruedas, camas y oxígeno.',
    entrada:
      'Atenmefa alquila equipos médicos para cuidado en casa en Ciudad Bolívar: sillas de ruedas, camas clínicas y equipos de oxígeno.',
    cobertura: 'Ciudad Bolívar',
    destacado: false,
    incluye: ['Sillas de ruedas', 'Camas clínicas', 'Equipos de oxígeno'],
    precioDesde: null,
    duracion: null,
    preparacion: null,
    entrega: null,
    preguntas: [
      { slug: 'cual-es-el-alquiler-minimo', pregunta: '¿Cuál es el alquiler mínimo?', respuesta: null },
      { slug: 'piden-deposito-o-garantia', pregunta: '¿Piden depósito o garantía?', respuesta: null },
      { slug: 'llevan-el-equipo-hasta-la', pregunta: '¿Llevan el equipo hasta la casa?', respuesta: null },
    ],
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
  /* El `slug` es la dirección de la página de esa pregunta y se escribe a
     mano, no se saca del texto: si mañana se reformula la pregunta, la
     dirección tiene que seguir siendo la misma o se rompe lo que Google ya
     indexó y lo que alguien haya compartido. */
  {
    slug: 'donde-queda-atenmefa',
    pregunta: '¿Dónde queda Atenmefa en Ciudad Bolívar?',
    respuesta:
      'Atenmefa está en la Av. Sucre, sector Puente Gómez, dentro del C.C. Santa Catalina, local 04, en Ciudad Bolívar, estado Bolívar.',
  },
  {
    slug: 'emergencias-24-horas',
    pregunta: '¿Atienden emergencias las 24 horas?',
    respuesta:
      'Sí. La línea 0414-893.91.76 atiende las 24 horas. También está disponible el 0414-851.74.22.',
  },
  {
    slug: 'atencion-a-domicilio',
    pregunta: '¿Hacen atención médica a domicilio?',
    respuesta:
      'Sí. Atenmefa presta servicios de salud a domicilio en Ciudad Bolívar, además de la atención en su local del C.C. Santa Catalina.',
  },
  {
    slug: 'traslados-fuera-del-estado',
    pregunta: '¿Hacen traslados en ambulancia fuera del estado Bolívar?',
    respuesta:
      'Sí. Atenmefa hace traslados a cualquier estado del país, en unidades con soporte vital y personal paramédico a bordo durante todo el trayecto.',
  },
  {
    slug: 'como-pedir-una-ambulancia',
    pregunta: '¿Cómo pido una ambulancia en Ciudad Bolívar?',
    respuesta:
      'Llamando o escribiendo al 0414-893.91.76, que atiende las 24 horas. Conviene tener a mano dónde está el paciente, qué le pasa y a dónde hay que llevarlo.',
  },
  {
    slug: 'examenes-del-laboratorio',
    pregunta: '¿Qué exámenes hace el laboratorio de Atenmefa?',
    respuesta:
      'Hematología completa, química sanguínea —glicemia, urea, creatinina y perfil lipídico—, examen de orina y examen de heces. Se procesan en el local del C.C. Santa Catalina.',
  },
  {
    slug: 'alquiler-de-equipos-medicos',
    pregunta: '¿Alquilan sillas de ruedas o camas clínicas?',
    respuesta:
      'Sí. Atenmefa alquila sillas de ruedas, camas clínicas y equipos de oxígeno para uso en casa.',
  },
  {
    slug: 'seguros-y-polizas',
    pregunta: '¿Trabajan con seguros?',
    respuesta:
      'Sí. Atenmefa atiende casos de seguros y de redes de asistencia médica. Para saber si su póliza aplica, escriba por WhatsApp con el nombre del seguro antes de la consulta.',
  },
  {
    slug: 'formas-de-pago',
    pregunta: '¿Qué formas de pago aceptan?',
    respuesta:
      'Pago móvil, transferencia en bolívares, punto de venta y divisas en efectivo.',
  },

  /* De acá para abajo falta el dato del cliente. La pregunta está escrita
     porque es la que la gente hace; mientras `respuesta` sea null no se
     publica, no sale en el schema y no tiene página. */
  {
    slug: 'orden-medica-para-examenes',
    pregunta: '¿Necesito orden médica para hacerme exámenes de laboratorio?',
    respuesta: null as Pendiente<string>,
  },
  {
    slug: 'cuanto-cuesta-un-traslado',
    pregunta: '¿Cuánto cuesta un traslado en ambulancia?',
    respuesta: null as Pendiente<string>,
  },
  {
    slug: 'cuando-estan-los-resultados',
    pregunta: '¿Cuándo están listos los resultados del laboratorio?',
    respuesta: null as Pendiente<string>,
  },
  {
    slug: 'ayuno-para-examenes',
    pregunta: '¿Hay que ir en ayunas para los exámenes de sangre?',
    respuesta: null as Pendiente<string>,
  },
  {
    slug: 'atienden-ninos',
    pregunta: '¿Atienden niños?',
    respuesta: null as Pendiente<string>,
  },
] as const;

/** Solo las que tienen respuesta confirmada llegan a la página y al schema. */
export const preguntasPublicables = preguntas.filter(
  (p): p is (typeof preguntas)[number] & { respuesta: string } => p.respuesta !== null,
);

export const serviciosDestacados = servicios.filter((s) => s.destacado);

export const servicioPorSlug = (slug: string) => servicios.find((s) => s.slug === slug);

/** Solo las preguntas del servicio que ya tienen dato confirmado. */
export const preguntasDe = (s: Servicio) =>
  s.preguntas.filter((p): p is { pregunta: string; respuesta: string } => p.respuesta !== null);

/* ------------------------------------------------------------------
   El catálogo de preguntas con página propia.
   ------------------------------------------------------------------

   Cada pregunta respondida tiene su dirección. No es un blog: es lo que
   recomienda el diagnóstico para que Gemini y AI Overviews puedan citar a
   la clínica. Esos buscadores extraen pares de pregunta y respuesta, y una
   respuesta que se sostiene sola en dos frases se cita; un párrafo dentro
   de una página de servicio, no.

   Lo que NO se hace acá: una página por cada combinación de servicio y
   sector para llenar el sitio. Eso son páginas puerta, Google las castiga
   y además se nota. Una pregunta tiene página cuando tiene una respuesta
   distinta que dar. */

export interface PreguntaConPagina {
  slug: string;
  pregunta: string;
  respuesta: string;
  /** El servicio del que habla, si es de uno. Sirve para enlazar de vuelta. */
  servicio: Servicio | null;
}

const respondida = (p: { respuesta: Pendiente<string> }): p is { respuesta: string } & typeof p =>
  typeof p.respuesta === 'string' && p.respuesta.trim().length > 0;

export const catalogoDePreguntas: readonly PreguntaConPagina[] = [
  ...preguntas.filter(respondida).map((p) => ({
    slug: p.slug, pregunta: p.pregunta, respuesta: p.respuesta, servicio: null,
  })),
  ...servicios.flatMap((s) =>
    s.preguntas.filter(respondida).map((p) => ({
      slug: p.slug, pregunta: p.pregunta, respuesta: p.respuesta, servicio: s,
    })),
  ),
];

export const preguntaPorSlug = (slug: string) =>
  catalogoDePreguntas.find((p) => p.slug === slug);

/* Las que todavía esperan el dato del cliente. No se publican, pero tenerlas
   contadas es lo que permite pedirlas en una sola lista en vez de a goteo. */
export const preguntasSinResponder: readonly { pregunta: string; servicio: string | null }[] = [
  ...preguntas.filter((p) => !respondida(p)).map((p) => ({ pregunta: p.pregunta, servicio: null })),
  ...servicios.flatMap((s) =>
    s.preguntas.filter((p) => !respondida(p)).map((p) => ({ pregunta: p.pregunta, servicio: s.nombre })),
  ),
];

export const wa = (mensaje: string) =>
  `https://wa.me/${clinica.contacto.whatsapp.e164.replace('+', '')}?text=${encodeURIComponent(mensaje)}`;
