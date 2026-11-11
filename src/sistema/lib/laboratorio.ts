/**
 * El laboratorio: la orden, lo que se le va a hacer y lo que dio.
 *
 * Vive aparte del cobro aunque use sus renglones, porque la pregunta que
 * contesta es otra. En cobro la pregunta es cuánto se le cobra; acá es qué
 * exámenes tiene pedidos esta persona. Son la misma fila de la base vista
 * desde dos lados, y el cliente lo pidió así: «poder ir seleccionando todo
 * lo que se va a hacer y que les genere el precio en bolívar y en dólares,
 * automáticamente, y esa persona se encarga de cobrar».
 *
 * De ahí la decisión que manda sobre este archivo: marcar un examen en el
 * formulario ES cargarlo a la cuenta. No hay dos listas que mantener
 * iguales —la de lo que se le hace y la de lo que se le cobra— porque dos
 * listas se separan el primer día que alguien corrige una sola.
 */
import { and, asc, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { bd, esquema } from './base';
import { pagadorSugerido } from './cobro';
import { esIdentificador, normalizar } from './atenciones';
import type { Resultado } from '../laboratorio';

/** La categoría del catálogo de precios donde viven los exámenes. */
export const CATEGORIA = 'laboratorio';

/**
 * Renglones del archivo que NO son exámenes: son rótulos de sección dentro
 * de una hoja («ANALISIS QUIMICO:», «CARACTERES FISICOS:») o datos de la
 * muestra («TIPO DE MUESTRA:», «Fecha de entrada:»).
 *
 * La lista es a mano y corta porque no hay regla: hay rótulos que terminan
 * en dos puntos y analitos que también —«Volumen de Orina/ 24 hrs:» y
 * «RAZON P/C:» son exámenes de verdad—, así que filtrar por los dos puntos
 * habría tirado cosas buenas. Se leyeron los dieciocho y se listaron los
 * siete que no van. Siguen apareciendo en la plantilla de resultados, que es
 * donde sirven de encabezado; lo que no hacen es entrar al catálogo de
 * precios como si se cobraran.
 */
const NO_SON_EXAMENES = new Set([
  'analisis microscopico:',
  'analisis quimico:',
  'caracteres fisicos:',
  'examen solicitado:',
  'fecha de entrada:',
  'otras determinaciones:',
  'tipo de muestra:',
]);

/**
 * Hojas que se venden ENTERAS y no por renglones: el General de Orina y los
 * exámenes de heces del baremo son un solo ítem con precio —$3, $3 y $5—,
 * no un menú de «ASPECTO», «COLOR» y «MOCO» a un dólar cada uno.
 *
 * Cuando estos formularios entraron como plantilla (021), sus renglones
 * cualitativos empezaron a aparecer en la lista de determinaciones que se
 * pueden cargar al catálogo: treinta nombres que nadie compra sueltos, y
 * la hoja entera convertida en un «perfil» que duplica el ítem del baremo.
 * No se excluyen por ser cualitativos sino por ser de estas tres hojas: una
 * plantilla nueva que el laboratorio escriba a mano sí tiene que poder
 * entrar al catálogo.
 */
const NO_SE_VENDE_POR_PARTES = new Set(['orina', 'heces', 'h. esp']);

/** Los exámenes que el centro cobra, con su precio. */
export function catalogoDeExamenes() {
  return bd
    .select({
      id: esquema.servicio.id,
      nombre: esquema.servicio.nombre,
      precio: esquema.servicio.precio,
      moneda: esquema.servicio.moneda,
    })
    .from(esquema.servicio)
    .where(and(
      eq(esquema.servicio.categoria, CATEGORIA),
      eq(esquema.servicio.activo, true),
    ))
    .orderBy(asc(esquema.servicio.nombre));
}

export type ExamenDelCatalogo = Awaited<ReturnType<typeof catalogoDeExamenes>>[number];

/**
 * Los exámenes ya pedidos en esta orden: los renglones que salieron del
 * catálogo de laboratorio.
 *
 * Se filtra por la categoría del servicio y no por la atención completa,
 * porque a una orden de laboratorio se le puede haber cargado otra cosa a
 * mano —el material de la toma, por ejemplo— y eso no es un examen.
 */
export async function examenesPedidos(atencionId: string) {
  const filas = await bd
    .select({
      renglonId: esquema.renglon.id,
      servicioId: esquema.renglon.servicioId,
      nombre: esquema.renglon.descripcion,
    })
    .from(esquema.renglon)
    .innerJoin(esquema.servicio, eq(esquema.servicio.id, esquema.renglon.servicioId))
    .where(and(
      eq(esquema.renglon.atencionId, atencionId),
      eq(esquema.servicio.categoria, CATEGORIA),
    ))
    .orderBy(asc(esquema.renglon.creado));

  return filas;
}

/**
 * Deja la cuenta diciendo exactamente lo que quedó marcado en el
 * formulario: carga los exámenes nuevos y quita los que se destildaron.
 *
 * Es idempotente a propósito. El formulario se guarda solo mientras
 * recepción escribe, y cada guardado manda la lista completa: si esto
 * insertara sin comparar, una orden de tres exámenes terminaría con quince
 * renglones y la cuenta cobrada cinco veces.
 */
export async function sincronizarExamenes(
  atencionId: string,
  marcados: readonly string[],
  aseguradora?: string | null,
): Promise<{ agregados: number; quitados: number }> {
  const quiere = new Set(marcados.filter(Boolean));
  const ya = await examenesPedidos(atencionId);
  const tiene = new Set(ya.map((r) => r.servicioId!).filter(Boolean));

  const sobran = ya.filter((r) => !quiere.has(r.servicioId!));
  if (sobran.length) {
    await bd.delete(esquema.renglon).where(and(
      eq(esquema.renglon.atencionId, atencionId),
      inArray(esquema.renglon.id, sobran.map((r) => r.renglonId)),
    ));
  }

  const faltan = [...quiere].filter((id) => !tiene.has(id));
  if (faltan.length) {
    /* El precio se copia al renglón, igual que en cobro: lo pedido queda
       congelado aunque mañana suba la lista. */
    const servicios = await bd
      .select()
      .from(esquema.servicio)
      .where(and(
        inArray(esquema.servicio.id, faltan),
        eq(esquema.servicio.categoria, CATEGORIA),
        eq(esquema.servicio.activo, true),
      ));

    if (servicios.length) {
      await bd.insert(esquema.renglon).values(
        servicios.map((s) => ({
          atencionId,
          servicioId: s.id,
          descripcion: s.nombre,
          cantidad: '1.00',
          precio: s.precio,
          moneda: s.moneda,
          paga: pagadorSugerido(aseguradora),
        })),
      );
    }
  }

  return { agregados: faltan.length, quitados: sobran.length };
}

/**
 * Las plantillas de examen que mandó el cliente.
 *
 * Elegir una pone sus renglones con el analito y la unidad ya escritos, que
 * es la mayor parte del trabajo de cargar un resultado. Lo que NO hace es
 * cerrar nada: el valor de referencia cae en un campo editable al lado del
 * valor que se está tecleando, y hay 92 analitos que vienen sin rango
 * porque su hoja no lo decía en una columna rotulada. Ver
 * 013-plantillas.sql, que explica por qué no se dedujo.
 */
export async function plantillasDeExamen() {
  const filas = await bd
    .select({
      examen: esquema.plantillaExamen.examen,
      analito: esquema.plantillaExamen.analito,
      unidad: esquema.plantillaExamen.unidad,
      referencia: esquema.plantillaExamen.referencia,
      tipo: esquema.plantillaExamen.tipo,
      opciones: esquema.plantillaExamen.opciones,
    })
    .from(esquema.plantillaExamen)
    .orderBy(asc(esquema.plantillaExamen.examen), asc(esquema.plantillaExamen.orden));

  const porExamen = new Map<
    string, {
      analito: string; unidad: string; referencia: string; tipo: string; opciones: string;
    }[]
  >();
  for (const f of filas) {
    const lista = porExamen.get(f.examen) ?? [];
    lista.push({
      analito: f.analito, unidad: f.unidad, referencia: f.referencia,
      tipo: f.tipo, opciones: f.opciones,
    });
    porExamen.set(f.examen, lista);
  }

  return [...porExamen.entries()].map(([examen, analitos]) => ({ examen, analitos }));
}

/**
 * El resumen de las plantillas, para la pantalla que las lista: cuántos
 * analitos tiene cada examen y cuántos siguen sin rango de referencia.
 *
 * La cifra de los que faltan va a la vista a propósito. Son los que el
 * archivo del cliente no traía, y mientras estén vacíos el informe sale
 * con el resultado y sin con qué compararlo.
 */
export async function resumenDePlantillas() {
  const filas = await bd
    .select({
      examen: esquema.plantillaExamen.examen,
      analitos: count(),
      /* Los encabezados de bloque no cuentan: nunca van a tener rango y
         los sumaba a la cifra de lo que el laboratorio tiene que escribir.
         Tampoco el renglón en blanco con el que nace una plantilla nueva. */
      analitosDeVerdad: sql<number>`count(*) filter (where ${esquema.plantillaExamen.tipo} = 'analito' and btrim(${esquema.plantillaExamen.analito}) <> '')`,
      /* La falta es la del renglón que no tiene NI rango NI menú: un menú
         —NEGATIVO, los colores de la orina— es su forma de informarse y
         no un rango pendiente. Contarlo aparte y restarlo después era un
         error: el que tenía los dos se descontaba dos veces. */
      sinRango: sql<number>`count(*) filter (where ${esquema.plantillaExamen.tipo} = 'analito' and btrim(${esquema.plantillaExamen.analito}) <> '' and btrim(${esquema.plantillaExamen.referencia}) = '' and btrim(${esquema.plantillaExamen.opciones}) = '')`,
    })
    .from(esquema.plantillaExamen)
    .groupBy(esquema.plantillaExamen.examen)
    .orderBy(asc(esquema.plantillaExamen.examen));

  return filas.map((f) => ({
    examen: f.examen,
    renglones: Number(f.analitos),
    analitos: Number(f.analitosDeVerdad),
    sinRango: Number(f.sinRango),
  }));
}

/** Los renglones de un examen, en su orden. */
export async function plantillaDe(examen: string) {
  return bd
    .select({
      orden: esquema.plantillaExamen.orden,
      analito: esquema.plantillaExamen.analito,
      unidad: esquema.plantillaExamen.unidad,
      referencia: esquema.plantillaExamen.referencia,
      tipo: esquema.plantillaExamen.tipo,
      opciones: esquema.plantillaExamen.opciones,
    })
    .from(esquema.plantillaExamen)
    .where(eq(esquema.plantillaExamen.examen, examen))
    .orderBy(asc(esquema.plantillaExamen.orden));
}

/**
 * Guarda los renglones de un examen tal como quedaron en la pantalla.
 *
 * Se borra y se vuelve a escribir en una transacción, en vez de hacer un
 * update por renglón: el orden puede cambiar, pueden haberse quitado
 * líneas y la clave primaria es (examen, orden). Intentar adivinar qué
 * renglón es cuál después de que alguien borró el tercero y agregó dos es
 * la clase de cuenta que sale mal una vez y deja un rango pegado al
 * analito equivocado.
 *
 * Un renglón sin nombre se descarta: es una línea en blanco que quedó de
 * apretar «agregar» de más. Uno con nombre y sin rango se guarda igual
 * —que es el estado de la mitad del archivo— y la pantalla lo cuenta.
 */
export async function guardarPlantilla(
  examen: string,
  filas: readonly {
    analito: string; unidad: string; referencia: string; tipo?: string; opciones?: string;
  }[],
) {
  const limpias = filas
    .map((f) => ({
      analito: f.analito.trim(),
      unidad: f.unidad.trim(),
      referencia: f.referencia.trim(),
      /* En la pantalla se escriben separadas por « / », porque una opción
         puede traer una coma adentro —«ACIDA (6,5)»— y también se aceptan
         ya separadas por línea, que es como viven en la base. */
      opciones: normalizarOpciones(f.opciones ?? ''),
      /* Un encabezado de bloque no lleva unidad ni rango aunque alguien
         los haya tecleado antes de marcarlo: si los guardara, el informe
         lo imprimiría como un analito vacío. */
      tipo: f.tipo === 'titulo' ? 'titulo' : 'analito',
    }))
    .filter((f) => f.analito)
    .map((f) => (f.tipo === 'titulo' ? { ...f, unidad: '', referencia: '', opciones: '' } : f));

  await bd.transaction(async (tx) => {
    await tx.delete(esquema.plantillaExamen).where(eq(esquema.plantillaExamen.examen, examen));
    if (limpias.length) {
      await tx.insert(esquema.plantillaExamen).values(
        limpias.map((f, i) => ({ examen, orden: i + 1, ...f })),
      );
    }
  });

  return limpias.length;
}

/** El texto tal como se guarda: una opción por línea, sin vacíos ni repetidas. */
function normalizarOpciones(texto: string) {
  const vistos = new Set<string>();
  return texto
    .split(/\s*[/\n]\s*/)
    .map((o) => o.trim())
    .filter((o) => {
      if (!o || vistos.has(o)) return false;
      vistos.add(o);
      return true;
    })
    .join('\n');
}

/**
 * Crea una plantilla nueva, para un examen que el archivo del laboratorio no
 * traía.
 *
 * Es lo que pedía el bioanalista: su archivo tiene las hojas de siempre,
 * pero el laboratorio hace más exámenes que los que están escritos ahí, y
 * hasta ahora cargar uno nuevo obligaba a escribirlo entero en cada orden.
 * La plantilla nace con un solo renglón en blanco, que es la pantalla de
 * edición ya abierta; si se guarda sin escribirle nada, desaparece sola.
 */
export async function crearPlantillaExamen(nombre: unknown) {
  const limpio = String(nombre ?? '').replace(/\s+/g, ' ').trim();
  if (limpio.length < 3) throw new Error('El nombre del examen hace falta, con al menos tres letras.');

  const [ya] = await bd
    .select({ analito: esquema.plantillaExamen.analito })
    .from(esquema.plantillaExamen)
    .where(eq(esquema.plantillaExamen.examen, limpio))
    .limit(1);
  if (ya) throw new Error(`Ya hay una plantilla llamada ${limpio}.`);

  await bd.insert(esquema.plantillaExamen).values({ examen: limpio, orden: 1, analito: '' });
  return limpio;
}

/**
 * Los nombres de HOJA del archivo del laboratorio. Cada hoja con más de un
 * analito es un perfil.
 */
export async function examenesDelArchivo(): Promise<string[]> {
  const filas = await bd
    .selectDistinct({ examen: esquema.plantillaExamen.examen })
    .from(esquema.plantillaExamen)
    .orderBy(asc(esquema.plantillaExamen.examen));
  return filas.map((f) => f.examen);
}

/**
 * Las DETERMINACIONES del archivo: los renglones de sus hojas, sin repetir.
 *
 * Son las que entran al catálogo con precio, porque es el nivel al que de
 * verdad se cobra: «un perfil puede tener 5 exámenes y yo solo quiero 3».
 * Sin los rótulos de sección, que no se le cobran a nadie.
 */
export async function determinacionesDelArchivo(): Promise<string[]> {
  const filas = await bd
    .selectDistinct({ examen: esquema.plantillaExamen.examen, analito: esquema.plantillaExamen.analito })
    .from(esquema.plantillaExamen)
    .orderBy(asc(esquema.plantillaExamen.analito));

  /* Se cuentan igual que las carga el cargador: por nombre normalizado. Dos
     hojas escriben «DEPURACION DE CREATININA» y «Depuración de creatinina»,
     que son el mismo examen y un solo precio. Contarlas distinto hacía que
     la pantalla ofreciera cargar 143 y cargara 141. */
  const unicos = new Map<string, string>();
  for (const f of filas) {
    const llave = normalizar(f.analito);
    /* El renglón en blanco con el que nace una plantilla nueva. */
    if (!llave) continue;
    if (NO_SON_EXAMENES.has(llave)) continue;
    /* Orina, heces y H. ESP se cobran como un ítem del baremo. */
    if (NO_SE_VENDE_POR_PARTES.has(normalizar(f.examen))) continue;
    if (!unicos.has(llave)) unicos.set(llave, f.analito);
  }
  return [...unicos.values()];
}

/**
 * Cuántas determinaciones del archivo todavía no están en el catálogo.
 *
 * Lo compara con la MISMA normalización que usa el cargador. Comparar de
 * otra manera hacía que la pantalla ofreciera cargar 143 y el cargador
 * cargara 141, y la tarjeta de «cargar» no se iba nunca porque creía que
 * faltaban dos.
 */
export async function faltanEnElCatalogo(): Promise<number> {
  const delArchivo = await determinacionesDelArchivo();
  const enCatalogo = await bd
    .select({ nombre: esquema.servicio.nombre })
    .from(esquema.servicio);
  const conocidos = new Set(enCatalogo.map((s) => normalizar(s.nombre)));
  const examenes = delArchivo.filter((d) => !conocidos.has(normalizar(d))).length;

  /* También cuentan los perfiles que falten.

     Antes esto solo miraba los exámenes, y con el catálogo lleno y la tabla
     de perfiles vacía la tarjeta de «cargar» no aparecía nunca: la pantalla
     de la orden quedaba con la columna de perfiles vacía y sin forma de
     llenarla desde adentro. Pasa de verdad cada vez que alguien borra los
     perfiles sin borrar los exámenes. */
  const hojas = await bd
    .select({ examen: esquema.plantillaExamen.examen, cuantos: count() })
    .from(esquema.plantillaExamen)
    .groupBy(esquema.plantillaExamen.examen);
  const yaPerfiles = await bd
    .select({ nombreBusca: esquema.perfil.nombreBusca })
    .from(esquema.perfil);
  const perfilesConocidos = new Set(yaPerfiles.map((p) => p.nombreBusca));
  // Una hoja con un solo analito es un examen, no un perfil. Y las que se
  // venden enteras no generan perfil: eso lo hace el baremo.
  const perfiles = hojas.filter(
    (h) =>
      Number(h.cuantos) > 1 &&
      !perfilesConocidos.has(normalizar(h.examen)) &&
      !NO_SE_VENDE_POR_PARTES.has(normalizar(h.examen)),
  ).length;

  return examenes + perfiles;
}

/**
 * Carga al catálogo lo que trae el archivo del laboratorio: las
 * determinaciones como exámenes con precio, y las hojas como perfiles.
 *
 * El selector de la orden sale del catálogo, y el catálogo arranca vacío:
 * la pantalla decía «todavía no hay exámenes» y la única salida era teclear
 * ciento cincuenta nombres a mano. Esto los pone de un golpe.
 *
 * QUÉ ES EXAMEN Y QUÉ ES PERFIL
 *
 * Lo decide el propio archivo. Una hoja con varios analitos es un perfil y
 * sus analitos son los exámenes: el perfil lipídico trae colesterol total,
 * HDL, LDL, VLDL y triglicéridos. Una hoja con uno solo —gota gruesa,
 * helicotest— es un examen y nada más.
 *
 * Así se puede cobrar «tres de los cinco», que es lo que el cliente pidió:
 * el perfil marca y lo que se cobra son los exámenes que queden marcados.
 *
 * LOS DEJA EN CERO, Y ESO NO ES UN DESCUIDO
 *
 * No tenemos sus precios, y un precio inventado en un catálogo termina
 * cobrado. Entran en 0 y la pantalla los muestra como «sin precio» —no como
 * «0,00»— y no los suma al total: recepción puede registrar hoy qué se le
 * hace al paciente, y la cuenta dice en la cara cuántos no tienen precio.
 *
 * Es idempotente: compara por nombre normalizado, así que correrlo dos
 * veces no duplica nada ni pisa un precio ya puesto.
 */
export async function cargarExamenesAlCatalogo(): Promise<{
  examenes: number; perfiles: number; apagados: number;
}> {
  const filas = await bd
    .select({
      examen: esquema.plantillaExamen.examen,
      analito: esquema.plantillaExamen.analito,
      orden: esquema.plantillaExamen.orden,
    })
    .from(esquema.plantillaExamen)
    .orderBy(asc(esquema.plantillaExamen.examen), asc(esquema.plantillaExamen.orden));

  /* Las determinaciones, sin repetir: «GLICEMIA» está en tres hojas y es un
     solo examen del catálogo con un solo precio. */
  const determinaciones = new Map<string, string>();
  for (const f of filas) {
    const llave = normalizar(f.analito);
    if (!llave || NO_SON_EXAMENES.has(llave)) continue;
    if (NO_SE_VENDE_POR_PARTES.has(normalizar(f.examen))) continue;
    determinaciones.set(llave, f.analito);
  }

  const yaEstan = await bd
    .select({ id: esquema.servicio.id, nombre: esquema.servicio.nombre })
    .from(esquema.servicio);
  const porNombre = new Map(yaEstan.map((s) => [normalizar(s.nombre), s.id]));

  const faltan = [...determinaciones.entries()].filter(([llave]) => !porNombre.has(llave));
  if (faltan.length) {
    const creados = await bd
      .insert(esquema.servicio)
      .values(faltan.map(([, nombre]) => ({
        nombre,
        categoria: CATEGORIA,
        precio: '0.00',
        moneda: 'USD',
        activo: true,
      })))
      .returning({ id: esquema.servicio.id, nombre: esquema.servicio.nombre });
    for (const c of creados) porNombre.set(normalizar(c.nombre), c.id);
  }

  /* Los perfiles: una hoja con más de un analito. */
  const porHoja = new Map<string, { analito: string; orden: number }[]>();
  for (const f of filas) {
    const lista = porHoja.get(f.examen) ?? [];
    lista.push({ analito: f.analito, orden: f.orden });
    porHoja.set(f.examen, lista);
  }

  const yaPerfiles = await bd
    .select({ nombreBusca: esquema.perfil.nombreBusca })
    .from(esquema.perfil);
  const perfilesConocidos = new Set(yaPerfiles.map((p) => p.nombreBusca));

  let perfilesNuevos = 0;
  for (const [hoja, miembros] of porHoja) {
    if (miembros.length < 2) continue;
    const llave = normalizar(hoja);
    if (perfilesConocidos.has(llave)) continue;
    /* Las hojas que se venden enteras no arman perfil: el ítem del baremo
       ya es el precio de la hoja completa, y un perfil lo duplicaría. */
    if (NO_SE_VENDE_POR_PARTES.has(llave)) continue;

    const [creado] = await bd
      .insert(esquema.perfil)
      .values({ nombre: hoja, nombreBusca: llave, orden: perfilesNuevos + 1 })
      .returning({ id: esquema.perfil.id });

    /* Sin repetir: hay hojas que listan el mismo analito dos veces —HEMA
       tiene VCM, HCM y CHCM duplicados, QUIMICA COMPLETA el ácido úrico— y
       un perfil contiene un examen una sola vez. */
    const vistos = new Set<string>();
    const aInsertar = miembros
      .map((m) => ({
        perfilId: creado.id,
        servicioId: porNombre.get(normalizar(m.analito)),
        orden: m.orden,
      }))
      .filter((m): m is { perfilId: string; servicioId: string; orden: number } => {
        /* Los rótulos de sección no tienen servicio y por eso caen acá. */
        if (!m.servicioId || vistos.has(m.servicioId)) return false;
        vistos.add(m.servicioId);
        return true;
      });

    if (aInsertar.length) await bd.insert(esquema.perfilExamen).values(aInsertar);
    perfilesNuevos++;
  }

  /* Y se apagan los renglones viejos del catálogo que eran el NOMBRE de una
     hoja: antes cada hoja entraba como un examen con un precio, y ahora esa
     hoja es un perfil. Dejar los dos permitiría cobrar lo mismo de dos
     maneras. Se apagan y no se borran —nada se borra— y solo si nadie les
     puso precio ni los cargó a una cuenta: si él ya decidió vender
     «QUIMICA RUTINA» como una sola cosa, eso se respeta. */
  const apagados = await bd.execute<{ nombre: string }>(sql`
    UPDATE servicio s SET activo = false
     WHERE s.categoria = ${CATEGORIA}
       AND s.activo
       AND s.precio = 0
       AND EXISTS (SELECT 1 FROM perfil p WHERE p.nombre_busca = ${sql`lower(trim(s.nombre))`})
       AND NOT EXISTS (SELECT 1 FROM renglon r WHERE r.servicio_id = s.id)
    RETURNING s.nombre
  `);

  return {
    examenes: faltan.length,
    perfiles: perfilesNuevos,
    apagados: apagados.length,
  };
}

/** Los perfiles activos con sus exámenes, para la pantalla de la orden. */
export async function perfilesConSusExamenes() {
  const filas = await bd
    .select({
      perfilId: esquema.perfil.id,
      perfil: esquema.perfil.nombre,
      orden: esquema.perfil.orden,
      servicioId: esquema.servicio.id,
      examen: esquema.servicio.nombre,
      precio: esquema.servicio.precio,
      moneda: esquema.servicio.moneda,
      miembroOrden: esquema.perfilExamen.orden,
    })
    .from(esquema.perfil)
    .innerJoin(esquema.perfilExamen, eq(esquema.perfilExamen.perfilId, esquema.perfil.id))
    .innerJoin(esquema.servicio, eq(esquema.servicio.id, esquema.perfilExamen.servicioId))
    .where(and(eq(esquema.perfil.activo, true), eq(esquema.servicio.activo, true)))
    .orderBy(
      sql`${esquema.perfil.orden} ASC NULLS LAST`,
      asc(esquema.perfil.nombre),
      asc(esquema.perfilExamen.orden),
    );

  const porPerfil = new Map<string, { id: string; nombre: string; examenes: { id: string; nombre: string }[] }>();
  for (const f of filas) {
    const p = porPerfil.get(f.perfilId) ?? { id: f.perfilId, nombre: f.perfil, examenes: [] };
    p.examenes.push({ id: f.servicioId, nombre: f.examen });
    porPerfil.set(f.perfilId, p);
  }
  return [...porPerfil.values()];
}

/* ------------------------------------------------------------------
   Armar perfiles a mano.
   ------------------------------------------------------------------

   El cliente nombró cinco —lipídico, básico, hepático, control prenatal y
   tiroideo— y tres de esos no existen como hoja en su archivo. Esos los
   arma él: no se inventa qué exámenes lleva un control prenatal.

   Y los que SÍ salieron del archivo vienen con el nombre de la pestaña
   («COAG.», «TRANS-BIL-PROT», «PBA.EMB Y OTRAS CUALI»), que sirve para
   trabajar en Excel y no para que recepción lo lea. Por eso se pueden
   renombrar.
   ------------------------------------------------------------------ */

/** Todos los perfiles, con cuántos exámenes trae cada uno. */
export async function listarPerfiles() {
  const filas = await bd
    .select({
      id: esquema.perfil.id,
      nombre: esquema.perfil.nombre,
      activo: esquema.perfil.activo,
      orden: esquema.perfil.orden,
      cuantos: sql<number>`(
        SELECT COUNT(*) FROM perfil_examen pe
          JOIN servicio s ON s.id = pe.servicio_id
         WHERE pe.perfil_id = ${esquema.perfil.id} AND s.activo
      )`,
      /* Lo que costaría el perfil completo hoy, en dólares. Es de
         referencia: lo que se cobra es lo que quede marcado. */
      suma: sql<string>`COALESCE((
        SELECT SUM(s.precio) FROM perfil_examen pe
          JOIN servicio s ON s.id = pe.servicio_id
         WHERE pe.perfil_id = ${esquema.perfil.id} AND s.activo AND s.moneda = 'USD'
      ), 0)`,
    })
    .from(esquema.perfil)
    .orderBy(sql`${esquema.perfil.orden} ASC NULLS LAST`, asc(esquema.perfil.nombre));

  return filas.map((f) => ({ ...f, cuantos: Number(f.cuantos) }));
}

/** Un perfil con los exámenes que trae, para editarlo. */
export async function perfilPorId(id: string) {
  if (!esIdentificador(id)) return null;

  const [cabecera] = await bd
    .select()
    .from(esquema.perfil)
    .where(eq(esquema.perfil.id, id))
    .limit(1);
  if (!cabecera) return null;

  const miembros = await bd
    .select({ servicioId: esquema.perfilExamen.servicioId })
    .from(esquema.perfilExamen)
    .where(eq(esquema.perfilExamen.perfilId, id));

  return { ...cabecera, examenes: miembros.map((m) => m.servicioId) };
}

/** Crea un perfil vacío. El nombre no se puede repetir. */
export async function crearPerfil(nombre: unknown) {
  const limpio = String(nombre ?? '').replace(/\s+/g, ' ').trim();
  if (limpio.length < 3) throw new Error('El nombre del perfil hace falta, con al menos tres letras.');

  const llave = normalizar(limpio);
  const [ya] = await bd
    .select({ nombre: esquema.perfil.nombre })
    .from(esquema.perfil)
    .where(eq(esquema.perfil.nombreBusca, llave))
    .limit(1);
  if (ya) throw new Error(`Ya hay un perfil llamado ${ya.nombre}.`);

  const [creado] = await bd
    .insert(esquema.perfil)
    .values({ nombre: limpio, nombreBusca: llave })
    .returning({ id: esquema.perfil.id, nombre: esquema.perfil.nombre });
  return creado;
}

/**
 * Guarda el nombre y los exámenes de un perfil.
 *
 * Los miembros se reemplazan por lo que llegue: la pantalla manda la lista
 * completa de casillas marcadas, así que lo que no venga es lo que se
 * destildó. Borrar y volver a insertar es más simple que calcular la
 * diferencia, y no se pierde nada: `perfil_examen` no guarda historia.
 */
export async function guardarPerfil(id: string, nombre: unknown, examenes: readonly string[]) {
  const perfil = await perfilPorId(id);
  if (!perfil) throw new Error('Ese perfil ya no está.');

  const limpio = String(nombre ?? '').replace(/\s+/g, ' ').trim();
  if (limpio.length < 3) throw new Error('El nombre del perfil hace falta, con al menos tres letras.');

  const llave = normalizar(limpio);
  if (llave !== perfil.nombreBusca) {
    const [otro] = await bd
      .select({ nombre: esquema.perfil.nombre })
      .from(esquema.perfil)
      .where(and(eq(esquema.perfil.nombreBusca, llave), ne(esquema.perfil.id, id)))
      .limit(1);
    if (otro) throw new Error(`Ya hay un perfil llamado ${otro.nombre}.`);
  }

  const buenos = [...new Set(examenes.filter((e) => esIdentificador(e)))];

  await bd.transaction(async (tx) => {
    await tx.update(esquema.perfil)
      .set({ nombre: limpio, nombreBusca: llave })
      .where(eq(esquema.perfil.id, id));
    await tx.delete(esquema.perfilExamen).where(eq(esquema.perfilExamen.perfilId, id));
    if (buenos.length) {
      await tx.insert(esquema.perfilExamen).values(
        buenos.map((servicioId, i) => ({ perfilId: id, servicioId, orden: i + 1 })),
      );
    }
  });

  return { nombre: limpio, cuantos: buenos.length };
}

/** Apaga o prende un perfil. No se borra: puede estar en órdenes viejas. */
export async function activarPerfil(id: string, activo: boolean) {
  if (!esIdentificador(id)) throw new Error('Ese perfil ya no está.');
  const [cambiado] = await bd
    .update(esquema.perfil)
    .set({ activo })
    .where(eq(esquema.perfil.id, id))
    .returning({ nombre: esquema.perfil.nombre });
  if (!cambiado) throw new Error('Ese perfil ya no está.');
  return cambiado;
}

/** Lo que se le pidió, como se lee en el informe. Uno por línea. */
export const textoDeExamenes = (nombres: readonly string[]) => nombres.join('\n');

/* ------------------------------------------------------------------
   Resultados.
   ------------------------------------------------------------------ */

/**
 * Lee la tabla de resultados que mandó el bioanalista.
 *
 * Los tres campos de cada examen viajan en arreglos paralelos
 * (valor[], unidad[], referencia[]) alineados con examen[]. Un examen sin
 * valor se guarda igual: en una orden de cinco se cargan tres hoy y dos
 * cuando salga la segunda corrida, y perder las filas vacías obligaría a
 * volver a escribir los nombres.
 *
 * Solo se descarta la línea COMPLETAMENTE vacía. Una con un valor escrito y
 * sin nombre no se tira en silencio —sería borrarle una medición a quien la
 * acaba de teclear—: vuelve a la pantalla y la pantalla pide ponerle nombre
 * antes de entregar.
 */
export function leerResultados(form: FormData): Resultado[] {
  const examenes = form.getAll('examen').map((v) => String(v).trim());
  const valores = form.getAll('valor').map((v) => String(v).trim());
  const unidades = form.getAll('unidad').map((v) => String(v).trim());
  const referencias = form.getAll('referencia').map((v) => String(v).trim());

  return examenes
    .map((examen, i) => ({
      examen,
      valor: valores[i] ?? '',
      unidad: unidades[i] ?? '',
      referencia: referencias[i] ?? '',
    }))
    .filter((r) => r.examen || r.valor || r.unidad || r.referencia);
}

/** Líneas con un resultado escrito y sin decir de qué examen es. */
export const sinNombre = (resultados: readonly Resultado[]) =>
  resultados.filter((r) => !r.examen && (r.valor || r.unidad || r.referencia)).length;

/** Cuántos de los exámenes pedidos ya tienen un valor escrito. */
export const cuantosResueltos = (resultados: readonly Resultado[]) =>
  resultados.filter((r) => r.valor).length;

/**
 * Guarda los resultados y, si se piden por listos, cierra la orden.
 *
 * Quien firma queda en resultados_por y no en medico_id: medico_id es quien
 * registró la orden, que casi siempre es recepción. En un informe de
 * laboratorio la firma que vale es la del bioanalista, con su colegio.
 */
export async function guardarResultados(
  atencionId: string,
  resultados: readonly Resultado[],
  bioanalistaId: string,
  entregar: boolean,
) {
  const [antes] = await bd
    .select({ estado: esquema.atencion.estado, tipo: esquema.atencion.tipo })
    .from(esquema.atencion)
    .where(eq(esquema.atencion.id, atencionId))
    .limit(1);

  if (!antes || antes.tipo !== 'laboratorio' || antes.estado !== 'borrador') return null;

  const [guardada] = await bd
    .update(esquema.atencion)
    .set({
      resultados: [...resultados],
      resultadosPor: bioanalistaId,
      resultadosEn: new Date(),
      ...(entregar ? { estado: 'cerrada' as const, cerrada: new Date() } : {}),
    })
    .where(and(
      eq(esquema.atencion.id, atencionId),
      eq(esquema.atencion.estado, 'borrador'),
    ))
    .returning({ id: esquema.atencion.id, numero: esquema.atencion.numero });

  return guardada ?? null;
}

/* ------------------------------------------------------------------
   La cola.
   ------------------------------------------------------------------ */

export type EstadoEnCola = 'sin-resultados' | 'a-medias' | 'entregada';

/**
 * Lo que el laboratorio tiene entre manos.
 *
 * Pendientes primero y lo más viejo arriba: una muestra que lleva dos días
 * sin resultado es más urgente que la de esta mañana, y en una lista
 * ordenada por fecha descendente esa es justo la que se pierde de vista.
 */
export async function colaDelLaboratorio(opciones: { entregadas?: boolean } = {}) {
  const filas = await bd
    .select({
      id: esquema.atencion.id,
      numero: esquema.atencion.numero,
      fecha: esquema.atencion.fecha,
      estado: esquema.atencion.estado,
      resultados: esquema.atencion.resultados,
      origenId: esquema.atencion.origenId,
      /* Para saber quién puede borrar la orden abierta. */
      medicoId: esquema.atencion.medicoId,
      aseguradora: esquema.atencion.aseguradora,
      paciente: esquema.paciente.nombre,
      cedula: esquema.paciente.cedula,
      /* Para el botón de WhatsApp de la cola: recepción avisa desde acá, sin
         tener que entrar a la orden. */
      telefono: esquema.paciente.telefono,
      whatsapp: esquema.paciente.whatsapp,
      registro: esquema.atencion.datos,
      examenes: sql<number>`(
        SELECT COUNT(*) FROM renglon r
          JOIN servicio s ON s.id = r.servicio_id
         WHERE r.atencion_id = ${esquema.atencion.id} AND s.categoria = ${CATEGORIA}
      )`,
    })
    .from(esquema.atencion)
    .innerJoin(esquema.paciente, eq(esquema.paciente.id, esquema.atencion.pacienteId))
    .where(and(
      eq(esquema.atencion.tipo, 'laboratorio'),
      opciones.entregadas
        ? eq(esquema.atencion.estado, 'cerrada')
        : eq(esquema.atencion.estado, 'borrador'),
    ))
    .orderBy(
      opciones.entregadas ? desc(esquema.atencion.fecha) : asc(esquema.atencion.fecha),
      opciones.entregadas ? desc(esquema.atencion.numero) : asc(esquema.atencion.numero),
    )
    .limit(100);

  return filas.map((f) => {
    const resueltos = cuantosResueltos(f.resultados ?? []);
    const estado: EstadoEnCola =
      f.estado === 'cerrada' ? 'entregada' : resueltos > 0 ? 'a-medias' : 'sin-resultados';
    return { ...f, resueltos, enCola: estado };
  });
}

/** Cuántas órdenes esperan resultados. Para el aviso del menú. */
export async function cuantasPendientes() {
  const [fila] = await bd
    .select({ n: sql<number>`COUNT(*)` })
    .from(esquema.atencion)
    .where(and(
      eq(esquema.atencion.tipo, 'laboratorio'),
      eq(esquema.atencion.estado, 'borrador'),
    ));
  return Number(fila?.n ?? 0);
}

/* ------------------------------------------------------------------
   El hilo con la consulta.
   ------------------------------------------------------------------ */

/**
 * Las órdenes de laboratorio que salieron de una consulta.
 *
 * Es la respuesta a lo que el cliente dejó abierto: «ese paciente al que el
 * médico le había solicitado un examen, ¿se queda aparte o se anexa a la
 * historia médica?». Se anexa. El médico ve el resultado donde escribió la
 * indicación, y el que vino solo al laboratorio —sin origen— no le aparece
 * nunca entre sus casos.
 */
export function ordenesDe(consultaId: string) {
  return bd
    .select({
      id: esquema.atencion.id,
      numero: esquema.atencion.numero,
      fecha: esquema.atencion.fecha,
      estado: esquema.atencion.estado,
      resultados: esquema.atencion.resultados,
      resultadosEn: esquema.atencion.resultadosEn,
    })
    .from(esquema.atencion)
    .where(eq(esquema.atencion.origenId, consultaId))
    .orderBy(asc(esquema.atencion.numero));
}

/** Órdenes de laboratorio de un paciente, para su ficha. */
export function ordenesDelPaciente(pacienteId: string) {
  return bd
    .select({
      id: esquema.atencion.id,
      numero: esquema.atencion.numero,
      fecha: esquema.atencion.fecha,
      estado: esquema.atencion.estado,
      resultados: esquema.atencion.resultados,
      origenId: esquema.atencion.origenId,
    })
    .from(esquema.atencion)
    .where(and(
      eq(esquema.atencion.pacienteId, pacienteId),
      eq(esquema.atencion.tipo, 'laboratorio'),
    ))
    .orderBy(desc(esquema.atencion.fecha), desc(esquema.atencion.numero));
}
