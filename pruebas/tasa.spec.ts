/**
 * El equivalente en bolívares.
 *
 * El centro cotiza en dólares y cobra en bolívares por taquilla, así que el
 * cierre del mes terminaba con dos totales que nadie podía sumar. Con la
 * tasa del BCV sí se puede, y entonces el número significa algo.
 *
 * Lo que se vigila es lo que hace que el número no mienta:
 *
 *   · que cada atención se convierta con la tasa de SU día. Convertir una
 *     atención de hace tres semanas con la tasa de hoy da un número
 *     inventado, y en Venezuela esa diferencia no es redondeo;
 *   · que lo que no se puede convertir se diga. Un total al que le faltan
 *     partes sin avisar es peor que no mostrar total;
 *   · que la tasa de un día que ya se guardó no se vuelva a escribir, porque
 *     eso cambiaría a destiempo informes ya emitidos.
 *
 * Las tasas se siembran acá: así la prueba no depende de que el BCV haya
 * publicado hoy ni de que haya internet. Sembrar la de hoy además evita que
 * la pantalla salga a buscarla.
 */
import { test, expect } from '@playwright/test';
import { conBase, entrar, montoDeTexto } from './apoyo';

/* El día según Caracas, que es el que usa el sistema. NO current_date de
   Postgres: el servidor corre en UTC y desde las 20:00 de Caracas ya es el
   día siguiente, así que una tasa insertada con current_date quedaba
   fechada mañana y la pantalla no la encontraba. */
const hoyEnCaracas = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

test.describe.configure({ mode: 'serial' });

/* Un mes viejo y tranquilo: ninguna otra prueba carga atenciones ahí, así
   que el cierre de ese mes solo tiene lo que siembra este archivo. */
const MES = '2024-03';
const DIA_BARATO = '2024-03-05';
const DIA_CARO = '2024-03-20';
const DIA_SIN_TASA = '2024-03-28';
/* Anterior a cualquier tasa guardada: no hay con qué convertirla. */
const VIEJA = '2019-02-11';

const TASA_BARATA = 36;
const TASA_CARA = 50;

const CEDULA = 'V-77.300.001';
const BUSCA = '77300001';

let caso1 = '';
let caso2 = '';
let caso3 = '';

test.beforeAll(async () => {
  await conBase(async (sql) => {
    // Limpio de corridas anteriores.
    const mios = sql`SELECT id FROM atencion WHERE paciente_id IN (
                       SELECT id FROM paciente WHERE cedula_busca = ${BUSCA})`;
    await sql`DELETE FROM renglon  WHERE atencion_id IN (${mios})`;
    await sql`DELETE FROM bitacora WHERE atencion_id IN (${mios})`;
    await sql`DELETE FROM atencion WHERE paciente_id IN (
                SELECT id FROM paciente WHERE cedula_busca = ${BUSCA})`;
    await sql`DELETE FROM paciente WHERE cedula_busca = ${BUSCA}`;
    await sql`DELETE FROM tasa WHERE fecha IN (${DIA_BARATO}, ${DIA_CARO})`;

    await sql`INSERT INTO tasa (fecha, bolivares) VALUES
                (${DIA_BARATO}, ${TASA_BARATA}), (${DIA_CARO}, ${TASA_CARA})
              ON CONFLICT DO NOTHING`;
    /* La de hoy, para que las pantallas no salgan a buscarla a la API. */
    await sql`INSERT INTO tasa (fecha, bolivares)
              VALUES (${hoyEnCaracas()}, 100) ON CONFLICT DO NOTHING`;

    const [medico] = await sql`SELECT id FROM "user" WHERE email = 'medico@atenmefa.local'`;
    const [p] = await sql`
      INSERT INTO paciente (cedula, cedula_busca, nombre, nombre_busca)
      VALUES (${CEDULA}, ${BUSCA}, 'Tasa Oficial de Prueba', 'tasa oficial de prueba')
      RETURNING id`;

    const crear = async (fecha: string) => {
      const [a] = await sql`
        INSERT INTO atencion (paciente_id, medico_id, estado, fecha, datos, cerrada)
        VALUES (${p.id}, ${medico.id}, 'cerrada', ${fecha}, '{}'::jsonb, now())
        RETURNING id`;
      await sql`INSERT INTO renglon (atencion_id, descripcion, cantidad, precio, moneda, paga)
                VALUES (${a.id}, 'Consulta de prueba', 1, 100, 'USD', 'paciente')`;
      return a.id as string;
    };

    caso1 = await crear(DIA_BARATO);
    caso2 = await crear(DIA_CARO);
    caso3 = await crear(DIA_SIN_TASA);
    await crear(VIEJA);
  });
});

test.afterAll(async () => {
  await conBase(async (sql) => {
    const mios = sql`SELECT id FROM atencion WHERE paciente_id IN (
                       SELECT id FROM paciente WHERE cedula_busca = ${BUSCA})`;
    await sql`DELETE FROM renglon  WHERE atencion_id IN (${mios})`;
    await sql`DELETE FROM bitacora WHERE atencion_id IN (${mios})`;
    await sql`DELETE FROM atencion WHERE paciente_id IN (
                SELECT id FROM paciente WHERE cedula_busca = ${BUSCA})`;
    await sql`DELETE FROM paciente WHERE cedula_busca = ${BUSCA}`;
    await sql`DELETE FROM tasa WHERE fecha IN (${DIA_BARATO}, ${DIA_CARO})`;
  });
});

/* ------------------------------------------------------------------
   Cada atención con la tasa de su día.
   ------------------------------------------------------------------ */

test('el cobro de un caso usa la tasa del día de ESE caso', async ({ page }) => {
  await entrar(page, 'administracion');

  await page.goto(`/sistema/atencion/${caso1}/cobro`);
  const barato = page.locator('.cuenta--bs');
  await expect(barato).toContainText('En bolívares');
  expect(montoDeTexto(await barato.innerText())).toBe(100 * TASA_BARATA);

  /* El mismo monto en dólares, quince días después: otro número. Si los dos
     dieran igual, es que se está usando una sola tasa para todo. */
  await page.goto(`/sistema/atencion/${caso2}/cobro`);
  const caro = page.locator('.cuenta--bs');
  expect(montoDeTexto(await caro.innerText())).toBe(100 * TASA_CARA);
});

test('un día sin publicación usa la última tasa publicada antes', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/atencion/${caso3}/cobro`);

  /* El 28 no tiene tasa propia. La que le toca es la última publicada en su
     fecha o antes —la del 20— que es como funciona de verdad: lo del sábado
     se liquida con la del viernes. Lo que NO puede pasar es que use la de
     hoy, que es más nueva que la atención. */
  const caja = page.locator('.cuenta--bs');
  await expect(caja).toBeVisible();
  expect(montoDeTexto(await caja.innerText())).toBe(100 * TASA_CARA);
  await expect(caja).toContainText('20');
});

test('lo que no se puede convertir queda fuera y se dice', async ({ page }) => {
  /* Una atención anterior a CUALQUIER tasa guardada. No se le puede poner
     precio en bolívares sin inventarlo, así que queda fuera del equivalente
     y la pantalla avisa. Un total al que le faltan partes sin avisar es peor
     que no mostrar total. */
  const anterior = await conBase(async (sql) => {
    const [f] = await sql`SELECT min(fecha)::text AS f FROM tasa`;
    return f?.f as string | undefined;
  });
  expect(anterior, 'la prueba necesita al menos una tasa guardada').toBeTruthy();
  expect(VIEJA < anterior!, `${VIEJA} tiene que ser anterior a ${anterior}`).toBe(true);

  await entrar(page, 'administracion');
  await page.goto(`/sistema/cierre?mes=${VIEJA.slice(0, 7)}`);

  const nota = page.locator('.nota-tasa');
  await expect(nota).toBeVisible();
  await expect(nota).toContainText('No se puede mostrar el equivalente');
  await expect(nota).toContainText('no hay tasa guardada de esas fechas');
  // Y no se inventa una cifra.
  await expect(page.locator('.cab__meta')).not.toContainText('≈');
});

/* ------------------------------------------------------------------
   El cierre del mes.
   ------------------------------------------------------------------ */

test('el cierre suma las tres atenciones, cada una a su tasa', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/cierre?mes=${MES}`);

  /* 100 USD el 5 a 36, y 100 USD el 20 y el 28, los dos a 50 (el 28 hereda
     la del 20, que es la última publicada antes). */
  const esperado = 100 * TASA_BARATA + 100 * TASA_CARA + 100 * TASA_CARA;

  const meta = page.locator('.cab__meta');
  await expect(meta).toContainText('≈');
  const leido = montoDeTexto((await meta.innerText()).split('≈')[1]);
  expect(leido).toBe(esperado);

  // Y lo mismo abajo, en el pie de la tabla.
  await expect(page.locator('tfoot .equiv')).toContainText('≈');
});

test('el cierre dice de dónde sale el número y con qué tasa', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/cierre?mes=${MES}`);

  const nota = page.locator('.nota-tasa');
  await expect(nota).toBeVisible();
  await expect(nota).toContainText('tasa oficial del BCV');
  // Lo importante: que diga que es la del día de cada atención, no la de hoy.
  await expect(nota).toContainText('del día de cada atención');
  await expect(nota).toContainText('no la de hoy');
});

test('sin nada que convertir no aparece el equivalente', async ({ page }) => {
  await entrar(page, 'administracion');
  /* Un mes sin atenciones: mostrar "≈ 0,00 Bs" sugeriría que se cobró cero,
     cuando lo que pasa es que no hubo nada. */
  await page.goto('/sistema/cierre?mes=2023-01');
  await expect(page.locator('.nota-tasa')).toHaveCount(0);
  await expect(page.locator('.cab__meta')).not.toContainText('≈');
});

/* ------------------------------------------------------------------
   La tasa guardada no se toca.
   ------------------------------------------------------------------ */

test('la tasa de un día que ya está guardado no se reescribe', async ({ page }) => {
  await entrar(page, 'administracion');

  /* Reescribir la tasa de un día cambiaría a destiempo informes ya emitidos:
     el cierre que se mandó la semana pasada daría otro número hoy. */
  await page.goto(`/sistema/cierre?mes=${MES}`);
  await page.goto('/sistema/cierre'); // el mes actual: acá sí pasa por asegurarTasa()

  const guardada = await conBase(async (sql) => {
    const [f] = await sql`SELECT bolivares::float8 AS v FROM tasa WHERE fecha = ${DIA_CARO}`;
    return f?.v as number | undefined;
  });
  expect(guardada).toBe(TASA_CARA);
});

/* ------------------------------------------------------------------
   El catálogo de precios.
   ------------------------------------------------------------------ */

test('el catálogo muestra cada precio también en bolívares, a la tasa de hoy', async ({ page }) => {
  const SERVICIO = `Servicio con tasa de prueba ${Date.now()}`;
  await conBase(async (sql) => {
    await sql`DELETE FROM servicio WHERE nombre LIKE 'Servicio con tasa de prueba%'`;
    await sql`INSERT INTO servicio (nombre, categoria, precio, moneda)
              VALUES (${SERVICIO}, 'consulta', 40, 'USD')`;
    /* Hoy, no el día de la atención: un precio de catálogo no pasó, es lo
       que se cobra hoy. Esa es la diferencia con el cierre y el cobro. */
    await sql`INSERT INTO tasa (fecha, bolivares) VALUES (${hoyEnCaracas()}, 100)
              ON CONFLICT (fecha) DO UPDATE SET bolivares = 100`;
  });

  await entrar(page, 'administracion');
  await page.goto('/sistema/servicios');

  const fila = page.locator('tr').filter({ hasText: SERVICIO });
  await expect(fila).toContainText('40,00');
  expect(montoDeTexto(await fila.locator('.fila__bs').innerText())).toBe(40 * 100);

  // Y dice con qué tasa, o el número no se puede comprobar contra nada.
  await expect(page.locator('.cab__tasa')).toContainText('BCV');

  await conBase((sql) => sql`DELETE FROM servicio WHERE nombre = ${SERVICIO}`);
});

test('un precio que ya está en bolívares no se convierte dos veces', async ({ page }) => {
  const SERVICIO = `Servicio en bolivares de prueba ${Date.now()}`;
  await conBase(async (sql) => {
    await sql`INSERT INTO servicio (nombre, categoria, precio, moneda)
              VALUES (${SERVICIO}, 'consulta', 5000, 'VES')`;
    await sql`INSERT INTO tasa (fecha, bolivares) VALUES (${hoyEnCaracas()}, 100)
              ON CONFLICT (fecha) DO UPDATE SET bolivares = 100`;
  });

  await entrar(page, 'administracion');
  await page.goto('/sistema/servicios');

  const fila = page.locator('tr').filter({ hasText: SERVICIO });
  await expect(fila).toContainText('5.000,00');
  // Nada de "≈ 500.000,00 Bs": ya está en bolívares.
  await expect(fila.locator('.fila__bs')).toHaveCount(0);

  await conBase((sql) => sql`DELETE FROM servicio WHERE nombre = ${SERVICIO}`);
});
