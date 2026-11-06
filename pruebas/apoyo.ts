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
  administracion: {
    correo: 'admin@atenmefa.local',
    clave: 'clave-de-prueba-2',
    nombre: 'Administración',
    rol: 'Administración',
  },
} as const;

export type Quien = keyof typeof CUENTAS;

export async function entrar(page: Page, quien: Quien = 'medico') {
  const cuenta = CUENTAS[quien];
  await page.goto('/sistema/entrar');
  await page.getByLabel('Correo').fill(cuenta.correo);
  await page.getByLabel('Clave').fill(cuenta.clave);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/sistema$/);
  return cuenta;
}

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
 * pone el id `c-<clave>` a cada uno, así que la prueba no depende del orden
 * de la pantalla ni del rótulo con que se muestre.
 */
export async function llenar(page: Page, campos: Record<string, string>) {
  for (const [clave, valor] of Object.entries(campos)) {
    const campo = page.locator(`#c-${clave}`);
    const etiqueta = await campo.evaluate((e) => e.tagName);
    if (etiqueta === 'SELECT') await campo.selectOption(valor);
    else await campo.fill(valor);
  }
}

/** Abre una sección plegable del formulario para poder escribir dentro. */
export async function abrirSeccion(page: Page, clave: string) {
  const seccion = page.locator(`#s-${clave}`);
  if (await seccion.locator('details[open]').count()) return;
  await seccion.locator('summary').click();
  await expect(seccion.locator('details[open]')).toHaveCount(1);
}

/** Guarda un borrador desde el formulario nuevo y devuelve su id. */
export async function crearBorrador(page: Page, campos: Record<string, string>) {
  await page.goto('/sistema/atencion/nueva');
  await llenar(page, campos);
  // El botón de borrador lleva formnovalidate: guarda aunque falte todo.
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page).toHaveURL(FICHA);
  return idDeLaFicha(page.url());
}

/** Registra y cierra una atención completa. Devuelve su id. */
export async function crearAtencionCerrada(page: Page, campos: Record<string, string>) {
  await page.goto('/sistema/atencion/nueva');
  await llenar(page, { ...historiaMinima, ...campos });
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
