/**
 * Derivaciones: interna (a un especialista del centro con cuenta), externa
 * (de afuera, por WhatsApp; ver interconsultas.spec.ts) y traslado.
 *
 * Lo que se vigila: que la interna le llegue al especialista y la atienda en
 * una consulta colgada de la original, que «pasa por recepción» ponga la
 * derivación en la cola de recepción y la deje moverla, y que un centro que
 * apaga ese paso en sus ajustes no lo vea más — ni por un formulario armado
 * a mano.
 */
import { test, expect, type Page } from '@playwright/test';
import { conBase, entrar, cedulaDePrueba, crearAtencionCerrada, borrarPacientes } from './apoyo';

test.describe.configure({ mode: 'serial' });

const CEDULA = cedulaDePrueba(21, 0);
const PACIENTE = 'Derivación de Prueba Montilla';
let consulta = '';

const limpiar = async () => {
  await borrarPacientes(CEDULA);
  await conBase(async (sql) => {
    await sql`UPDATE "user" SET especialidad = NULL WHERE email = 'medico2@atenmefa.local'`;
    await sql`DELETE FROM ajuste`;
  });
};
test.beforeAll(limpiar);
test.afterAll(limpiar);

const postearAMano = (page: Page, url: string, campos: Record<string, string>) =>
  page.evaluate(async ({ url, campos }) => {
    const datos = new FormData();
    for (const [k, v] of Object.entries(campos)) datos.append(k, v);
    return (await fetch(url, { method: 'POST', body: datos })).text();
  }, { url, campos });

test('administración le pone la especialidad a un médico en Cuentas', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/usuarios');
  const fila = page.locator('li', { hasText: 'medico2@atenmefa.local' }).first();
  await fila.locator('summary', { hasText: 'Corregir sus datos' }).click();
  await fila.getByLabel('Especialidad de Segundo Médico').fill('Cardiología');
  await fila.getByRole('button', { name: 'Guardar' }).first().click();
  const [u] = await conBase((sql) => sql`
    SELECT especialidad FROM "user" WHERE email = 'medico2@atenmefa.local'`);
  expect(u.especialidad).toBe('Cardiología');
});

test('el médico deriva adentro, directo, y el especialista lo atiende', async ({ page }) => {
  await entrar(page, 'medico');
  consulta = await crearAtencionCerrada(page, { cedula: CEDULA, nombre: PACIENTE });
  await page.goto(`/sistema/atencion/${consulta}`);

  const seccion = page.locator('#interconsultas');
  // Hay especialista del centro: es lo que viene elegido.
  await expect(seccion.locator('input[name="tipo_derivacion"][value="interna"]')).toBeChecked();
  await seccion.locator('#medico_destino').selectOption({ label: 'Cardiología · Segundo Médico' });
  await seccion.locator('#motivo_interconsulta').fill('Soplo nuevo, valorar.');
  // De fábrica, la interna viene marcada para recepción. Esta va directa.
  const recepcion = seccion.locator('input[name="por_recepcion"]');
  await expect(recepcion).toBeChecked();
  await recepcion.uncheck();
  await seccion.getByRole('button', { name: 'Derivar' }).click();
  await expect(page.locator('#interconsultas .ic')).toContainText('Cardiología · Segundo Médico');
});

test('recepción no la ve: va directa', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await page.goto('/sistema/derivaciones');
  await expect(page.locator('.ic', { hasText: PACIENTE })).toHaveCount(0);
});

test('el especialista la tiene en su panel y la atiende en una consulta colgada de la original', async ({ page }) => {
  await entrar(page, 'medico2');
  await page.goto('/sistema/derivaciones');
  const tarjeta = page.locator('.ic', { hasText: PACIENTE });
  await expect(tarjeta).toContainText('Soplo nuevo, valorar.');
  await tarjeta.getByRole('button', { name: 'Atenderlo' }).click();
  await expect(page).toHaveURL(/\/sistema\/atencion\/[0-9a-f-]{36}\/editar/);

  const [nueva] = await conBase((sql) => sql`
    SELECT a.origen_id, a.estado, a.datos->>'motivo' AS motivo, u.email
      FROM interconsulta i
      JOIN atencion a ON a.id = i.atencion_destino_id
      JOIN "user" u ON u.id = a.medico_id
     WHERE i.atencion_id = ${consulta} AND i.tipo = 'interna'`);
  expect(nueva.origen_id).toBe(consulta);
  expect(nueva.estado).toBe('borrador');
  expect(nueva.email).toBe('medico2@atenmefa.local');
  expect(nueva.motivo).toContain('Soplo nuevo');
});

test('un traslado que pasa por recepción: recepción lo ve y lo cierra', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${consulta}`);
  const seccion = page.locator('#interconsultas');
  await seccion.locator('input[name="tipo_derivacion"][value="traslado"]').check();
  await seccion.locator('#centro').fill('Hospital Ruiz y Páez');
  // De fábrica, el traslado viene marcado para recepción: coordina la ambulancia.
  await expect(seccion.locator('input[name="por_recepcion"]')).toBeChecked();
  await seccion.getByRole('button', { name: 'Derivar' }).click();
  await expect(page.locator('#interconsultas .ic')).toContainText(['Traslado a Hospital Ruiz y Páez']);

  await page.context().clearCookies();
  await entrar(page, 'recepcionista');
  await page.goto('/sistema/derivaciones');
  const tarjeta = page.locator('.ic', { hasText: 'Hospital Ruiz y Páez' });
  await expect(tarjeta).toContainText('en ambulancia');
  await tarjeta.getByRole('button', { name: 'Ya se trasladó' }).click();
  await expect(page.locator('.msj--bien')).toContainText('Quedó cerrada');

  const [t] = await conBase((sql) => sql`
    SELECT estado FROM interconsulta WHERE atencion_id = ${consulta} AND tipo = 'traslado'`);
  expect(t.estado).toBe('atendida');
});

test('un centro que apaga el paso por recepción no lo ve más', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/ajustes');
  await page.locator('input[name="ajuste"][value="recepcion_derivaciones"]').uncheck();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('.msj--bien')).toContainText('Guardado');

  await page.context().clearCookies();
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${consulta}`);
  await expect(page.locator('input[name="por_recepcion"]')).toHaveCount(0);

  // Y aunque llegue marcado a mano, no se guarda.
  await postearAMano(page, `/sistema/atencion/${consulta}`, {
    accion: 'pedir_interconsulta', tipo_derivacion: 'externa', especialidad: 'Dermatología',
    motivo_interconsulta: '', por_recepcion: 'si',
  });
  const [d] = await conBase((sql) => sql`
    SELECT por_recepcion FROM interconsulta WHERE atencion_id = ${consulta} AND especialidad = 'Dermatología'`);
  expect(d.por_recepcion).toBe(false);
});

test('solo administración cambia los ajustes', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await page.goto('/sistema/ajustes');
  await expect(page).toHaveURL(/\/sistema\/sin-permiso/);
});
