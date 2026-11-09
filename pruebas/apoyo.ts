/**
 * Apoyo compartido de las pruebas de extremo a extremo.
 *
 * Lo que más de un archivo necesita vive acá: entrar al sistema, armar una
 * atención llenando el formulario de verdad, cargarle cobro y limpiar lo
 * que la prueba dejó.
 *
 * Los datos se crean por pantalla y no por la base, porque lo que se está
 * probando es el camino completo. La base se toca solo para dos cosas:
 * limpiar al final —nada se borra desde el sistema, a propósito— y anular
 * una atención, que todavía no tiene pantalla.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres, { type Sql } from 'postgres';

/* ------------------------------------------------------------------
   La base: limpieza y lo que no tiene pantalla todavía.
   ------------------------------------------------------------------ */

/**
 * La cadena de conexión sale del entorno. Si quien corre las pruebas no
 * exportó el .env (set -a; . ./.env; set +a), se lee del archivo: así el
 * fallo no aparece disfrazado de "no conecta con la base".
 */
function cadenaDeConexion() {
  if (process.env.BASE_DATOS) return process.env.BASE_DATOS;

  const texto = readFileSync(join(process.cwd(), '.env'), 'utf8');
  const linea = texto.split('\n').find((l) => l.startsWith('BASE_DATOS='));
  if (!linea) throw new Error('Falta BASE_DATOS: expórtelo o déjelo en .env.');
  return linea.slice('BASE_DATOS='.length).trim();
}

/**
 * Una conexión corta por tarea. Son unas pocas consultas por archivo, y así
 * ningún cliente queda abierto cuando la prueba termina.
 */
export async function conBase<T>(tarea: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadenaDeConexion(), { max: 1 });
  try {
    return await tarea(sql);
  } finally {
    await sql.end();
  }
}

/* ------------------------------------------------------------------
   Datos inventados.
   ------------------------------------------------------------------ */

/**
 * Cuatro dígitos que cambian en cada corrida. Sirven para que dos pasadas
 * seguidas no se peleen el mismo paciente ni la misma aseguradora.
 */
export const CORRIDA = String(Date.now()).slice(-4);

/**
 * Cédulas de prueba del rango V-99.xxx.xxx, que no se emite en la realidad.
 * `archivo` y `n` son un solo dígito cada uno: el primero identifica el
 * archivo de pruebas y el segundo al paciente dentro de ese archivo, así
 * dos pruebas distintas nunca escriben sobre la misma persona.
 */
/* OJO con el número de archivo: es lo único que separa las cédulas de un
   .spec de las de otro, y cedulaDePrueba(2) y cedulaDePrueba(2, 0) son LA
   MISMA cédula. Dos archivos con el mismo número se pisan: el afterAll de
   uno borra el paciente que el otro todavía está usando, y la falla sale en
   cualquier parte menos donde está el problema. Pasó entre puerta/paciente y
   entre tablero/cierre.
   Series en uso: 1 atencion · 2 paciente · 3 cobro · 4 cierre · 5 documento
   · 6 responsivo · 7 atajos · 8 pacientes · 9 permisos · 10 puerta
   · 11 tablero · 12 verificacion · 13 laboratorio · 14 enviar
   · 15 diagnosticos · 16 borrar-borrador · 17 perfiles. El siguiente
   archivo que necesite cédulas toma el 18. */
export function cedulaDePrueba(archivo: number, n = 0) {
  const serie = `99${archivo}${CORRIDA}${n}`;
  return `V-${serie.slice(0, 2)}.${serie.slice(2, 5)}.${serie.slice(5)}`;
}

export const soloDigitos = (texto: string) => texto.replace(/\D/g, '');

/** Lee un monto como lo escribe la pantalla: "1.234,56 USD" → 1234.56. */
export function montoDeTexto(texto: string) {
  const encontrado = texto.match(/-?[\d.]*\d,\d{2}/);
  return encontrado ? Number(encontrado[0].replace(/\./g, '').replace(',', '.')) : NaN;
}

/**
 * Misma cuenta que hace clavear() en sistema/lib/cierre.ts. Se repite acá
 * en vez de importar ese módulo porque él arrastra la conexión a la base, y
 * la prueba necesita este dato en el navegador.
 */
export const claveDeCobrador = (nombre: string) =>
  nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/* ------------------------------------------------------------------
   Entrar y salir.
   ------------------------------------------------------------------ */

export const CUENTAS = {
  medico: {
    correo: 'medico@atenmefa.local',
    clave: 'clave-de-prueba-1',
    nombre: 'Médico de Prueba',
    rol: 'Médico',
  },
  /* Segundo médico: sin él no se puede probar que un borrador lo termina
     quien lo abrió, porque con una sola cuenta médica todo es propio. */
  medico2: {
    correo: 'medico2@atenmefa.local',
    clave: 'clave-de-prueba-3',
    nombre: 'Segundo Médico',
    rol: 'Médico',
  },
  administracion: {
    correo: 'admin@atenmefa.local',
    clave: 'clave-de-prueba-2',
    nombre: 'Administración',
    rol: 'Administración',
  },
  /* El bioanalista carga resultados y no escribe historias; recepción
     registra órdenes y cobra. Sin las dos cuentas no se puede probar lo que
     de verdad importa del laboratorio: que la orden la abre uno y la cierra
     otro. */
  bioanalista: {
    correo: 'laboratorio@atenmefa.local',
    clave: 'clave-de-prueba-4',
    nombre: 'Bioanalista de Prueba',
    rol: 'Bioanalista',
  },
  recepcionista: {
    correo: 'recepcion@atenmefa.local',
    clave: 'clave-de-prueba-5',
    nombre: 'Recepción de Prueba',
    rol: 'Recepción',
  },
} as const;

export type Quien = keyof typeof CUENTAS;

export async function entrar(page: Page, quien: Quien = 'medico') {
  const cuenta = CUENTAS[quien];
  await page.goto('/sistema/entrar');
  await page.getByLabel('Correo').fill(cuenta.correo);
  await page.getByLabel('Clave').fill(cuenta.clave);
  await page.getByRole('button', { name: 'Entrar' }).click();
  /* Cada rol cae en su pantalla: el bioanalista y recepción en la cola del
     laboratorio, que es donde trabajan; el médico y administración en los
     casos. Ver dondeEmpieza en lib/permisos.ts. */
  const suya = quien === 'bioanalista' || quien === 'recepcionista'
    ? /\/sistema\/laboratorio$/
    : /\/sistema$/;
  await expect(page).toHaveURL(suya);
  return cuenta;
}

/**
 * Un examen en el catálogo de precios, con su categoría de laboratorio.
 *
 * Se crea por la base y no por pantalla a propósito: lo que la prueba
 * quiere ejercitar es el selector de exámenes, no el formulario del
 * catálogo, que tiene su propio archivo.
 */
export async function sembrarExamen(nombre: string, precio = '12.00') {
  return conBase(async (sql) => {
    const [ya] = await sql`
      SELECT id FROM servicio WHERE nombre = ${nombre} LIMIT 1`;
    if (ya) {
      await sql`UPDATE servicio
                   SET categoria = 'laboratorio', activo = true,
                       precio = ${precio}, moneda = 'USD'
                 WHERE id = ${ya.id}`;
      return String(ya.id);
    }
    const [creado] = await sql`
      INSERT INTO servicio (nombre, categoria, precio, moneda, activo)
      VALUES (${nombre}, 'laboratorio', ${precio}, 'USD', true)
      RETURNING id`;
    return String(creado.id);
  });
}

export const borrarExamen = (...nombres: string[]) =>
  conBase(async (sql) => {
    await sql`DELETE FROM renglon WHERE servicio_id IN (
                SELECT id FROM servicio WHERE nombre IN ${sql(nombres)})`;
    await sql`DELETE FROM servicio WHERE nombre IN ${sql(nombres)}`;
  });

export async function salir(page: Page) {
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page).toHaveURL(/\/sistema\/entrar$/);
}

/* ------------------------------------------------------------------
   Atenciones.
   ------------------------------------------------------------------ */

/** La ficha de un caso: /sistema/atencion/<uuid>. */
export const FICHA = /\/sistema\/atencion\/[0-9a-f-]{36}$/;

export const idDeLaFicha = (url: string) => url.split('/atencion/')[1].split(/[/?#]/)[0];

/**
 * Lo mínimo que exige el modelo para cerrar una atención, aparte del nombre
 * y la cédula. La fecha, la hora de inicio y el nombre del médico los
 * precarga el formulario.
 */
export const historiaMinima = {
  edad: '41',
  sexo: 'Femenino',
  lugar: 'En el local',
  motivo: 'Dolor abdominal de dos días',
  enfermedad_actual: 'Refiere dolor en hipocondrio derecho, sin fiebre ni vómitos.',
  idx: 'Cólico biliar',
  hora_fin: '11:40',
};

/**
 * Escribe campos del formulario por su clave del modelo. Campo.astro le
 * pone el id `c-<clave>` a cada uno, así que la prueba no depende del
 * rótulo con que se muestre.
 *
 * El formulario va por pasos y muestra una sección a la vez: antes de
 * escribir hay que estar en el paso del campo, igual que el médico.
 */
export async function llenar(page: Page, campos: Record<string, string>) {
  for (const [clave, valor] of Object.entries(campos)) {
    const campo = page.locator(`#c-${clave}`);
    await irAlPasoDe(page, campo);
    const etiqueta = await campo.evaluate((e) => e.tagName);
    if (etiqueta === 'SELECT') await campo.selectOption(valor);
    else await campo.fill(valor);
  }
}

/** Lleva el formulario al paso donde vive ese campo, si hay pasos. */
export async function irAlPasoDe(page: Page, campo: Locator) {
  const indice = await campo.evaluate((e) => {
    const hoja = e.closest('[data-hoja]') as HTMLElement | null;
    if (!hoja) return -1;            // pantalla sin pasos
    return hoja.hidden ? Number(hoja.dataset.hoja) : -1;
  });
  if (indice < 0) return;
  await page.locator(`[data-ir="${indice}"]`).click();
  await expect(campo).toBeVisible();
}

/**
 * Deja una sección lista para escribir dentro.
 *
 * Con el formulario por pasos ya no hace falta desplegar nada: el script
 * abre todas las secciones al cargar, porque plegarlas estorba cuando se
 * ve una a la vez. Queda esperar a que eso haya pasado — el script es
 * diferido y la prueba puede llegar antes.
 *
 * Sin JavaScript (o en una pantalla sin pasos) sigue haciendo el clic.
 */
export async function abrirSeccion(page: Page, clave: string) {
  const seccion = page.locator(`#s-${clave}`);
  const hayPasos = (await page.locator('[data-hoja]').count()) > 0;

  if (hayPasos) {
    await expect(seccion.locator('details[open]')).toHaveCount(1);
    return;
  }

  if (await seccion.locator('details[open]').count()) return;
  await seccion.locator('summary').click();
  await expect(seccion.locator('details[open]')).toHaveCount(1);
}

/** Guarda un borrador desde el formulario nuevo y devuelve su id. */
/**
 * Abre el formulario pasando por la puerta de la cédula, que es lo primero
 * que se pregunta. Sin cédula no hay a quién atender, así que las pruebas
 * que no la traen se quedan en la puerta a propósito.
 */
async function abrirFormulario(page: Page, cedula?: string) {
  if (!cedula) {
    await page.goto('/sistema/atencion/nueva');
    return;
  }
  /* tipo=general salta la pantalla que pregunta si es atención o
     laboratorio. Casi todas las pruebas son de la atención clínica y les
     interesa el formulario, no la bifurcación; la bifurcación tiene su
     propio archivo. */
  await page.goto(
    `/sistema/atencion/nueva?cedula=${encodeURIComponent(cedula)}&tipo=general`,
  );
  await expect(page.locator('[data-hoja]').first()).toBeAttached();

  /* Y se espera a que el formulario termine de volverse "por pasos".
     Antes se esperaba solo al HTML, que está desde el primer momento, y la
     prueba podía empezar a escribir justo mientras el script escondía las
     hojas: escribía en una que se estaba por ocultar y el valor no llegaba a
     guardarse. Fallaba una vez cada tantas corridas y en otro archivo.
     El formulario funciona sin script —se ve largo y entero— así que esto no
     puede ser obligatorio: si la marca no aparece, se sigue igual. */
  await page.locator('.pasos[data-armado]').waitFor({ timeout: 5000 }).catch(() => {});
}

export async function crearBorrador(page: Page, campos: Record<string, string>) {
  await abrirFormulario(page, campos.cedula);
  await llenar(page, campos);
  // El botón de borrador lleva formnovalidate: guarda aunque falte todo.
  await page.getByRole('button', { name: 'Guardar y salir' }).click();
  await expect(page).toHaveURL(FICHA);
  return idDeLaFicha(page.url());
}

/**
 * Cerrar una atención solo se ofrece en el último paso: antes confunde.
 * El médico llega ahí avanzando; la prueba, saltando al último.
 */
export async function irAlUltimoPaso(page: Page) {
  const pasos = await page.locator('[data-ir]').count();
  if (pasos) await page.locator(`[data-ir="${pasos - 1}"]`).click();
}

/** Registra y cierra una atención completa. Devuelve su id. */
export async function crearAtencionCerrada(page: Page, campos: Record<string, string>) {
  const todo = { ...historiaMinima, ...campos };
  await abrirFormulario(page, todo.cedula);
  await llenar(page, todo);
  await irAlUltimoPaso(page);
  await page.getByRole('button', { name: 'Cerrar atención' }).click();
  await expect(page).toHaveURL(FICHA);
  return idDeLaFicha(page.url());
}

/** El N° de caso que muestra la ficha abierta. */
export async function numeroDelCaso(page: Page) {
  const texto = await page.locator('.cab__meta').first().innerText();
  const encontrado = texto.match(/N°\s*(\d+)/);
  return encontrado ? encontrado[1] : '';
}

/* ------------------------------------------------------------------
   Cobro.
   ------------------------------------------------------------------ */

export interface RenglonAMano {
  descripcion: string;
  cantidad?: string;
  precio: string;
  /** 'paciente' | 'aseguradora' | 'empresa'. */
  paga?: string;
  /** 'USD' | 'VES'. */
  moneda?: string;
}

/**
 * Carga un renglón escrito a mano. Es el camino más controlable para una
 * prueba: el precio y la moneda los pone ella y no dependen del catálogo.
 */
export async function cargarAMano(page: Page, atencion: string, renglon: RenglonAMano) {
  await page.goto(`/sistema/atencion/${atencion}/cobro`);

  // La sección va plegada: escribir a mano es la excepción, no la rutina.
  await page.getByText('Renglón escrito a mano').click();

  await page.locator('#descripcion').fill(renglon.descripcion);
  await page.locator('#cantidad-libre').fill(renglon.cantidad ?? '1');
  await page.locator('#precio-libre').fill(renglon.precio);
  if (renglon.moneda) await page.locator('#moneda-libre').selectOption(renglon.moneda);
  await page.locator('#paga-libre').selectOption(renglon.paga ?? 'paciente');

  await page.locator('form.carga--mano').getByRole('button', { name: 'Cargar' }).click();
  await expect(page.locator('tr', { hasText: renglon.descripcion })).toBeVisible();
}

/** Quita un renglón ya cargado, desde su propia fila. */
export async function quitarRenglon(page: Page, atencion: string, descripcion: string) {
  await page.goto(`/sistema/atencion/${atencion}/cobro`);
  await page.locator('tr', { hasText: descripcion }).getByRole('button', { name: 'Quitar' }).click();
  await expect(page.locator('tr', { hasText: descripcion })).toHaveCount(0);
}

/** El panel con el total y el reparto por pagador. */
export const panelDeLaCuenta = (page: Page) =>
  page.locator('section.caja', { has: page.getByRole('heading', { name: 'La cuenta' }) });

/** El monto en dólares de una celda que puede traer varias monedas. */
export async function dolaresDe(celda: Locator) {
  const montos = await celda.locator('span.cifra').allInnerTexts();
  const enDolares = montos.find((t) => t.includes('USD'));
  return enDolares ? montoDeTexto(enDolares) : 0;
}

/* ------------------------------------------------------------------
   Lo que no tiene pantalla: anular.
   ------------------------------------------------------------------ */

/**
 * Anula una atención.
 *
 * Va por la base porque el sistema todavía no tiene pantalla de anulación:
 * la ficha sabe mostrar el estado y el cierre sabe dejarla fuera, pero
 * nadie la pone en ese estado desde el navegador. Lo que estas pruebas
 * verifican es lo segundo, no cómo se anula.
 *
 * El motivo y el autor se escriben porque la tabla los exige
 * (constraint anulacion_con_motivo): una atención no se anula a secas.
 */
export async function anularEnLaBase(atencion: string, motivo: string) {
  await conBase(async (sql) => {
    const filas = await sql`
      UPDATE atencion
         SET estado = 'anulada',
             anulada_motivo = ${motivo},
             anulada_por = (SELECT id FROM "user" WHERE email = ${CUENTAS.administracion.correo})
       WHERE id = ${atencion}
      RETURNING id`;
    expect(filas.length, 'la atención que se iba a anular no estaba').toBe(1);
  });
}

/* ------------------------------------------------------------------
   Consultas de apoyo.
   ------------------------------------------------------------------ */

/**
 * El mes al que entra una atención, leído de la columna periodo.
 *
 * Se le pregunta a la base en vez de calcularlo acá: el periodo lo genera
 * ella a partir de la fecha, y el reloj del proceso que corre las pruebas
 * puede estar en otra zona que el de Caracas.
 */
export async function mesDeLaAtencion(atencion: string) {
  return conBase(async (sql) => {
    const [fila] = await sql`
      SELECT to_char(periodo, 'YYYY-MM') AS mes FROM atencion WHERE id = ${atencion}`;
    return String(fila.mes);
  });
}

/** Cuántos pacientes hay con esa cédula, escrita como sea. */
export async function cuantosPacientes(cedula: string) {
  return conBase(async (sql) => {
    const [fila] = await sql`
      SELECT count(*)::int AS cuantos FROM paciente WHERE cedula_busca = ${soloDigitos(cedula)}`;
    return Number(fila.cuantos);
  });
}

/** Cuántas atenciones cuelgan de esa cédula. */
export async function cuantasAtenciones(cedula: string) {
  return conBase(async (sql) => {
    const [fila] = await sql`
      SELECT count(*)::int AS cuantas
        FROM atencion a
        JOIN paciente p ON p.id = a.paciente_id
       WHERE p.cedula_busca = ${soloDigitos(cedula)}`;
    return Number(fila.cuantas);
  });
}

/** Las acciones que quedaron en bitácora para una atención, en orden. */
export async function bitacoraDe(atencion: string) {
  return conBase(async (sql) => {
    const filas = await sql`
      SELECT accion FROM bitacora WHERE atencion_id = ${atencion} ORDER BY id`;
    return filas.map((f) => String(f.accion));
  });
}

/** La hora de la base, que es la que firma la bitácora. */
export async function ahoraEnLaBase() {
  return conBase(async (sql) => {
    const [fila] = await sql`SELECT now() AS ahora`;
    return fila.ahora as Date;
  });
}

/* ------------------------------------------------------------------
   Limpieza. Cada archivo deja la base como la encontró.
   ------------------------------------------------------------------ */

/**
 * Borra todo lo que cuelga de esas cédulas. El orden respeta las claves
 * foráneas: la bitácora apunta a la atención y no cae por cascada.
 */
/**
 * Borra por la LLAVE de búsqueda y no por la cédula: el que no trae cédula
 * se guarda con una llave prefijada (P:, N:, SD:) y soloDigitos no la
 * encuentra. Ver src/sistema/lib/documento.ts.
 */
export async function borrarPorLlave(...llaves: string[]) {
  await conBase(async (sql) => {
    for (const busca of llaves) {
      const deEsa = sql`
        SELECT a.id FROM atencion a
          JOIN paciente p ON p.id = a.paciente_id
         WHERE p.cedula_busca = ${busca}`;
      await sql`DELETE FROM bitacora WHERE atencion_id IN (${deEsa})`;
      await sql`DELETE FROM renglon  WHERE atencion_id IN (${deEsa})`;
      await sql`DELETE FROM atencion WHERE paciente_id IN (
                  SELECT id FROM paciente WHERE cedula_busca = ${busca})`;
      await sql`DELETE FROM paciente WHERE cedula_busca = ${busca}`;
    }
  });
}

/** El paciente tal como quedó guardado, buscado por su llave. */
export async function pacientePorLlave(llave: string) {
  return conBase(async (sql) => {
    const [p] = await sql`
      SELECT cedula, cedula_busca, tipo_doc, nombre FROM paciente
       WHERE cedula_busca = ${llave}`;
    return p as { cedula: string; cedula_busca: string; tipo_doc: string; nombre: string } | undefined;
  });
}

export async function borrarPacientes(...cedulas: string[]) {
  await conBase(async (sql) => {
    for (const cedula of cedulas) {
      const busca = soloDigitos(cedula);
      const deEsaCedula = sql`
        SELECT a.id FROM atencion a
          JOIN paciente p ON p.id = a.paciente_id
         WHERE p.cedula_busca = ${busca}`;

      await sql`DELETE FROM bitacora WHERE atencion_id IN (${deEsaCedula})`;
      await sql`DELETE FROM renglon  WHERE atencion_id IN (${deEsaCedula})`;
      await sql`DELETE FROM atencion WHERE paciente_id IN (
                  SELECT id FROM paciente WHERE cedula_busca = ${busca})`;
      await sql`DELETE FROM paciente WHERE cedula_busca = ${busca}`;
    }
  });
}

/** Saca del catálogo los servicios que inventó la prueba. */
export async function borrarServicios(...nombres: string[]) {
  await conBase(async (sql) => {
    for (const nombre of nombres) {
      await sql`DELETE FROM renglon WHERE servicio_id IN (
                  SELECT id FROM servicio WHERE nombre = ${nombre})`;
      await sql`DELETE FROM servicio WHERE nombre = ${nombre}`;
    }
  });
}

/**
 * Las descargas del cierre dejan un 'exporto' que no cuelga de ninguna
 * atención, así que no se va con el paciente: hay que buscarlo por hora.
 * El `desde` tiene que venir de ahoraEnLaBase(), no del reloj local.
 */
export async function borrarExportos(desde: Date) {
  await conBase(async (sql) => {
    await sql`DELETE FROM bitacora WHERE accion = 'exporto' AND momento >= ${desde}`;
  });
}

/* ------------------------------------------------------------------
   Responsivo.
   ------------------------------------------------------------------ */

/** Lo que mide el documento contra lo que mide la ventana. */
export async function anchos(page: Page) {
  return page.evaluate(() => ({
    documento: document.documentElement.scrollWidth,
    ventana: document.documentElement.clientWidth,
  }));
}

/* ------------------------------------------------------------------
   Registro de pacientes.
   ------------------------------------------------------------------ */

/** Lo que la base guarda de una persona, buscada por su cédula. */
export async function pacienteEnLaBase(cedula: string) {
  return conBase(async (sql) => {
    const [fila] = await sql`
      SELECT id, cedula, nombre, telefono, whatsapp, correo
        FROM paciente
       WHERE cedula_busca = ${soloDigitos(cedula)}`;
    expect(fila, `no hay ningún paciente con la cédula ${cedula}`).toBeTruthy();
    const texto = (v: unknown) => (v === null || v === undefined ? null : String(v));
    return {
      id: String(fila.id),
      cedula: String(fila.cedula),
      nombre: String(fila.nombre),
      telefono: texto(fila.telefono),
      whatsapp: texto(fila.whatsapp),
      correo: texto(fila.correo),
    };
  });
}

/**
 * Lo facturado a una persona, sumado por moneda desde los renglones.
 *
 * Es la cuenta contra la que se compara el recuadro de la ficha, y se hace
 * en Postgres para no repetir en JavaScript la misma suma que se está
 * verificando. Las monedas no se mezclan, igual que en el cobro.
 *
 * Con `conAnuladas` suma también las que quedaron sin efecto: sirve para
 * comprobar que la ficha las deja afuera, porque si la anulada no tuviera
 * renglones cargados los dos totales darían igual y la prueba no probaría
 * nada.
 */
export async function renglonesSumadosDe(cedula: string, conAnuladas = false) {
  return conBase(async (sql) => {
    const busca = soloDigitos(cedula);
    const filas = conAnuladas
      ? await sql`
          SELECT r.moneda, sum(r.cantidad * r.precio)::float8 AS total
            FROM renglon r
            JOIN atencion a ON a.id = r.atencion_id
            JOIN paciente p ON p.id = a.paciente_id
           WHERE p.cedula_busca = ${busca}
           GROUP BY r.moneda`
      : await sql`
          SELECT r.moneda, sum(r.cantidad * r.precio)::float8 AS total
            FROM renglon r
            JOIN atencion a ON a.id = r.atencion_id
            JOIN paciente p ON p.id = a.paciente_id
           WHERE p.cedula_busca = ${busca} AND a.estado <> 'anulada'
           GROUP BY r.moneda`;

    return Object.fromEntries(filas.map((f) => [String(f.moneda), Number(f.total)]));
  });
}

/** Las acciones que la bitácora anotó sobre una ficha, en orden. */
export async function bitacoraDePaciente(paciente: string) {
  return conBase(async (sql) => {
    const filas = await sql`
      SELECT accion FROM bitacora
       WHERE detalle ->> 'paciente' = ${paciente}
       ORDER BY id`;
    return filas.map((f) => String(f.accion));
  });
}

/**
 * Lo que la ficha deja en bitácora —verla y corregir el teléfono— no cuelga
 * de ninguna atención: su atencion_id es nulo y la persona a la que apunta
 * vive en el detalle. Por eso borrarPacientes() no se lo lleva y hay que
 * borrarlo aparte, ANTES de borrar al paciente, mientras todavía se le
 * puede resolver el id desde la cédula.
 */
export async function borrarBitacoraDePacientes(...cedulas: string[]) {
  await conBase(async (sql) => {
    for (const cedula of cedulas) {
      await sql`
        DELETE FROM bitacora
         WHERE detalle ->> 'paciente' IN (
                 SELECT id::text FROM paciente WHERE cedula_busca = ${soloDigitos(cedula)})`;
    }
  });
}

/* ------------------------------------------------------------------
   Medición del sitio público.
   ------------------------------------------------------------------ */

/**
 * El user-agent de un teléfono cualquiera.
 *
 * Hace falta ponerlo a mano y no es un adorno: el navegador que levanta
 * Playwright se presenta como "HeadlessChrome", que el filtro de
 * rastreadores reconoce y descarta con razón. Con el agente por omisión no
 * se registra una sola visita y la prueba falla sin que nada esté roto.
 */
export const AGENTE_TELEFONO =
  'Mozilla/5.0 (Linux; Android 13; SM-A135M) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/120.0.0.0 Mobile Safari/537.36';

/** El mismo visitante pero en una computadora: otra huella, misma IP. */
export const AGENTE_COMPUTADORA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/120.0.0.0 Safari/537.36';

export const AGENTE_RASTREADOR =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/** Las visitas registradas desde ese momento. `ruta` acota a una página. */
export async function visitasDesde(desde: Date, ruta?: string) {
  return conBase(async (sql) => {
    const filas = ruta
      ? await sql`
          SELECT ruta, referente, dispositivo::text AS dispositivo, navegador, pais, huella,
                 to_char(momento AT TIME ZONE 'America/Caracas', 'YYYY-MM-DD') AS dia
            FROM visita WHERE momento >= ${desde} AND ruta = ${ruta} ORDER BY id`
      : await sql`
          SELECT ruta, referente, dispositivo::text AS dispositivo, navegador, pais, huella,
                 to_char(momento AT TIME ZONE 'America/Caracas', 'YYYY-MM-DD') AS dia
            FROM visita WHERE momento >= ${desde} ORDER BY id`;
    return filas.map((f) => ({
      ruta: String(f.ruta),
      referente: f.referente === null ? null : String(f.referente),
      dispositivo: String(f.dispositivo),
      navegador: f.navegador === null ? null : String(f.navegador),
      pais: f.pais === null ? null : String(f.pais),
      huella: String(f.huella),
      dia: String(f.dia),
    }));
  });
}

/** Los eventos registrados desde ese momento. `tipo` acota a una acción. */
export async function eventosDesde(desde: Date, tipo?: string) {
  return conBase(async (sql) => {
    const filas = tipo
      ? await sql`
          SELECT tipo::text AS tipo, detalle, ruta, huella
            FROM evento WHERE momento >= ${desde} AND tipo::text = ${tipo} ORDER BY id`
      : await sql`
          SELECT tipo::text AS tipo, detalle, ruta, huella
            FROM evento WHERE momento >= ${desde} ORDER BY id`;
    return filas.map((f) => ({
      tipo: String(f.tipo),
      detalle: f.detalle === null ? null : String(f.detalle),
      ruta: String(f.ruta),
      huella: String(f.huella),
    }));
  });
}

/** Los nombres de las columnas de una tabla, en el orden en que se declaró. */
export async function columnasDe(tabla: string) {
  return conBase(async (sql) => {
    const filas = await sql`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ${tabla}
       ORDER BY ordinal_position`;
    return filas.map((f) => String(f.column_name));
  });
}

/**
 * Deja las dos tablas de medición como estaban.
 *
 * Son las únicas del sistema que se pueden borrar sin perder nada: son
 * conteos del sitio público, no datos clínicos. El `desde` tiene que venir
 * de ahoraEnLaBase() para no llevarse lo que ya había.
 */
export async function borrarMediciones(desde: Date) {
  await conBase(async (sql) => {
    await sql`DELETE FROM visita WHERE momento >= ${desde}`;
    await sql`DELETE FROM evento WHERE momento >= ${desde}`;
  });
}

/**
 * El día según Caracas, que es el que usa el sistema.
 *
 * NO `current_date` de Postgres: el servidor de la base corre en UTC y
 * desde las 20:00 de Caracas allá ya es el día siguiente. Una tasa
 * sembrada con `current_date` queda fechada mañana, la pantalla busca la
 * de hoy y no la encuentra: el total en bolívares desaparece y la prueba
 * falla sola todas las noches, siempre después de las ocho.
 */
export const hoyEnCaracas = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
