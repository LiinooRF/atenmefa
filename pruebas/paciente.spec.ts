/**
 * La cédula identifica, pero la escribe quien está de guardia.
 *
 * "V-99.000.003" y "V99000003" son la misma persona, y el sistema tiene que
 * saberlo o la historia del paciente queda partida en dos fichas que nadie
 * cruza. Esto es lo que cuida pacienteDe(): la cédula se guarda normalizada
 * aparte y esa es la llave.
 */
import { test, expect } from '@playwright/test';
import {
  borrarPacientes, cedulaDePrueba, conBase, crearAtencionCerrada, cuantosPacientes, entrar,
  numeroDelCaso, soloDigitos,
} from './apoyo';

test.describe.configure({ mode: 'serial' });

/** La misma cédula escrita de dos maneras, como llega del mostrador. */
const CON_PUNTOS = cedulaDePrueba(2, 0);
const SIN_PUNTOS = `V${soloDigitos(CON_PUNTOS)}`;
const NOMBRE = 'María Eugenia Castillo de Prueba';

/* El diagnóstico de la primera visita. La lista de atenciones anteriores
   se resume por el diagnóstico y no por el motivo: es lo que el médico
   busca de un barrido antes de tocar al paciente. */
const IDX_PRIMERA = 'Hipertensión arterial controlada';

let primera = '';
let numeroPrimera = '';

test.afterAll(async () => {
  await borrarPacientes(CON_PUNTOS);
});

test('la primera atención crea al paciente', async ({ page }) => {
  await entrar(page);

  primera = await crearAtencionCerrada(page, {
    nombre: NOMBRE,
    cedula: CON_PUNTOS,
    motivo: 'Control de tensión arterial',
    idx: IDX_PRIMERA,
  });
  numeroPrimera = await numeroDelCaso(page);

  expect(await cuantosPacientes(CON_PUNTOS)).toBe(1);
});

test('la misma cédula escrita distinto es el mismo paciente', async ({ page }) => {
  await entrar(page);

  const segunda = await crearAtencionCerrada(page, {
    nombre: NOMBRE,
    cedula: SIN_PUNTOS,
    motivo: 'Dolor de garganta',
  });
  expect(segunda).not.toBe(primera);

  // Una sola persona en la tabla, aunque la cédula entró de dos formas.
  expect(await cuantosPacientes(SIN_PUNTOS)).toBe(1);

  /* Y se nota donde importa: la ficha nueva muestra la atención anterior,
     que es lo que el médico necesita ver antes de tocar al paciente. */
  const previas = page.locator('section.ficha', {
    has: page.getByRole('heading', { name: 'Atenciones anteriores' }),
  });
  await expect(previas).toContainText(`N° ${numeroPrimera}`);
  await expect(previas).toContainText(IDX_PRIMERA);
});

test('las dos atenciones cuelgan de la misma ficha de paciente', async ({ page }) => {
  await entrar(page);

  const [fila] = await conBase(
    (sql) => sql`
      SELECT p.cedula, count(a.id)::int AS atenciones
        FROM paciente p
        JOIN atencion a ON a.paciente_id = p.id
       WHERE p.cedula_busca = ${soloDigitos(CON_PUNTOS)}
       GROUP BY p.id, p.cedula`,
  );

  expect(Number(fila.atenciones)).toBe(2);
  /* Se conserva la cédula tal como se escribió la primera vez: corregir el
     formato en una atención posterior no reescribe el documento del
     paciente, solo el nombre y el teléfono. */
  expect(String(fila.cedula)).toBe(CON_PUNTOS);

  // Y la búsqueda las encuentra con cualquiera de las dos escrituras.
  for (const escritura of [CON_PUNTOS, SIN_PUNTOS]) {
    await page.goto(`/sistema?q=${encodeURIComponent(escritura)}`);
    await expect.soft(page.locator('ul.casos li'), `buscando ${escritura}`).toHaveCount(2);
  }
});
