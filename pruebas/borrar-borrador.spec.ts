/**
 * Borrar un borrador.
 *
 * Es la única cosa que se borra de una atención, y el cliente lo pidió
 * así: «el médico empieza una y no la termina, en borradores la puede
 * borrar, igual que el bioanalista», y «el admin puede borrar borradores,
 * y si no, se borran en 20 días».
 *
 * Se puede porque un borrador no está firmado: no entró en el cierre del
 * mes, no se imprimió con PIN y no se le entregó a nadie. Lo que esto NO
 * puede hacer, y es lo que se vigila acá, es tocar algo firmado ni dejar
 * que el borrador de uno lo borre otro que no sea administración.
 */
import { test, expect } from '@playwright/test';
import {
  conBase, entrar, cedulaDePrueba, idDeLaFicha, FICHA, historiaMinima,
  irAlUltimoPaso, llenar, borrarPacientes,
} from './apoyo';

test.describe.configure({ mode: 'serial' });

const MIO = cedulaDePrueba(16, 0);
const AJENO = cedulaDePrueba(16, 1);
const CERRADO = cedulaDePrueba(16, 2);
const VIEJO = cedulaDePrueba(16, 3);
const CON_COBRO = cedulaDePrueba(16, 4);

test.afterAll(async () => {
  await borrarPacientes(MIO, AJENO, CERRADO, VIEJO, CON_COBRO);
});

/** Abre un borrador con el nombre puesto y devuelve su id. */
async function abrirBorrador(page: import('@playwright/test').Page, cedula: string, nombre: string) {
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(cedula)}&tipo=general`);
  /* Por `llenar` y no con un fill suelto: con un paciente ya conocido el
     formulario arranca en el paso del caso y el campo del nombre queda
     escondido. El helper lleva la pantalla al paso del campo. */
  await llenar(page, { nombre });
  await page.getByRole('button', { name: 'Guardar y salir' }).click();
  await expect(page).toHaveURL(FICHA);
  return idDeLaFicha(page.url());
}

test('el médico borra el borrador que abrió él', async ({ page }) => {
  await entrar(page, 'medico');
  const caso = await abrirBorrador(page, MIO, 'Borrador Propio de Prueba');

  await page.goto('/sistema/borradores');
  await page.locator('.pend li', { hasText: 'Borrador Propio de Prueba' })
    .getByRole('link', { name: /Borrar/ }).click();

  await expect(page.getByRole('heading', { name: /¿Borrar el borrador/ })).toBeVisible();
  await page.getByRole('button', { name: 'Borrar el borrador' }).click();

  await expect(page).toHaveURL(/\/sistema\/borradores\?borrado=1$/);
  await expect(page.locator('.msj--bien')).toContainText('se borró');

  const quedan = await conBase((sql) => sql`SELECT 1 FROM atencion WHERE id = ${caso}`);
  expect(quedan.length).toBe(0);
});

test('el borrado queda en bitácora, con el número y el paciente', async () => {
  const lineas = await conBase((sql) => sql`
    SELECT accion, detalle FROM bitacora
     WHERE accion = 'borro_borrador' ORDER BY momento DESC LIMIT 1`);
  expect(lineas.length).toBe(1);
  /* `paciente_nombre` y no `paciente`: esa clave la usa la bitácora para el
     ID del paciente y la pantalla la castea a uuid. Guardar un nombre ahí
     tiraba la bitácora entera con un 500. */
  const d = lineas[0].detalle as { paciente_nombre: string; numero: number };
  expect(d.paciente_nombre).toBe('Borrador Propio de Prueba');
  expect(d.numero).toBeGreaterThan(0);
});

test('el segundo médico abre el suyo', async ({ page }) => {
  /* Hace falta un borrador que NO sea del primer médico, y sin él no se
     puede probar lo único que importa de esta regla. Va en su propia
     prueba: dos sesiones en una no se pueden, entrar() cuenta con llegar al
     formulario de login. */
  await entrar(page, 'medico2');
  await abrirBorrador(page, AJENO, 'Borrador Ajeno de Prueba');
});

test('el borrador de otro médico no se borra', async ({ page }) => {
  await entrar(page, 'medico');
  const [ajeno] = await conBase((sql) => sql`
    SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${AJENO.replace(/\D/g, '')}`);

  await page.goto('/sistema/borradores');
  const fila = page.locator('.pend li', { hasText: 'Borrador Ajeno de Prueba' });
  await expect(fila).toBeVisible();
  await expect(fila.getByRole('link', { name: /Borrar/ })).toHaveCount(0);

  await page.goto(`/sistema/atencion/${ajeno.id}/borrar`);
  await expect(page.getByRole('heading', { name: 'Este borrador no es suyo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Borrar el borrador' })).toHaveCount(0);

  const sigue = await conBase((sql) => sql`SELECT 1 FROM atencion WHERE id = ${ajeno.id}`);
  expect(sigue.length).toBe(1);
});

test('administración borra el de cualquiera', async ({ page }) => {
  const [ajeno] = await conBase((sql) => sql`
    SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${AJENO.replace(/\D/g, '')}`);

  await entrar(page, 'administracion');
  /* Y tiene la pantalla en su menú, aunque no escriba historias: es su
     trabajo nuevo. */
  await expect(page.locator('.sis__barra')).toContainText('Borradores');

  await page.goto(`/sistema/atencion/${ajeno.id}/borrar`);
  await page.getByRole('button', { name: 'Borrar el borrador' }).click();
  await expect(page).toHaveURL(/\?borrado=1$/);

  const quedan = await conBase((sql) => sql`SELECT 1 FROM atencion WHERE id = ${ajeno.id}`);
  expect(quedan.length).toBe(0);
});

test('una atención cerrada no se borra: se anula', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CERRADO)}&tipo=general`);
  await page.locator('#c-nombre').fill('Cerrada de Prueba');
  await llenar(page, historiaMinima);
  await irAlUltimoPaso(page);
  await page.getByRole('button', { name: 'Cerrar atención' }).click();
  await expect(page).toHaveURL(FICHA);
  const caso = idDeLaFicha(page.url());

  // En la ficha no hay botón de borrar, solo el camino de anular.
  await expect(page.getByRole('link', { name: 'Borrar' })).toHaveCount(0);

  await page.goto(`/sistema/atencion/${caso}/borrar`);
  await expect(page.getByRole('heading', { name: /ya no es un borrador/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Borrar el borrador' })).toHaveCount(0);

  const sigue = await conBase((sql) => sql`SELECT estado::text AS estado FROM atencion WHERE id = ${caso}`);
  expect(sigue[0].estado).toBe('cerrada');
});

/* ------------------------------------------------------------------
   Los veinte días.
   ------------------------------------------------------------------ */

test('un borrador que nadie toca en 20 días se va solo', async ({ page }) => {
  await entrar(page, 'medico');
  const caso = await abrirBorrador(page, VIEJO, 'Borrador Olvidado de Prueba');

  /* Se lo envejece a mano: la creación Y la bitácora, porque el borrado
     mira la última de las dos. Envejecer solo una de ellas haría pasar la
     prueba sin probar nada. */
  await conBase(async (sql) => {
    await sql`UPDATE atencion SET creada = now() - interval '40 days' WHERE id = ${caso}`;
    await sql`UPDATE bitacora SET momento = now() - interval '40 days' WHERE atencion_id = ${caso}`;
  });

  await page.goto('/sistema/borradores');
  await expect(page.locator('.msj--bien')).toContainText('nadie tocó en 20 días');
  await expect(page.locator('main')).not.toContainText('Borrador Olvidado de Prueba');

  const quedan = await conBase((sql) => sql`SELECT 1 FROM atencion WHERE id = ${caso}`);
  expect(quedan.length).toBe(0);

  // Y queda la línea, sin usuario: no lo borró nadie.
  const [linea] = await conBase((sql) => sql`
    SELECT usuario_id, detalle FROM bitacora
     WHERE accion = 'borro_borrador' ORDER BY momento DESC LIMIT 1`);
  expect(linea.usuario_id).toBeNull();
  expect((linea.detalle as { automatico: boolean }).automatico).toBe(true);
});

test('uno viejo con cobro cargado NO se va solo', async ({ page }) => {
  /* Un cobro que desaparece solo es un agujero en la caja. Si hay plata
     adentro, el borrador se queda hasta que una persona decida. */
  await entrar(page, 'medico');
  const caso = await abrirBorrador(page, CON_COBRO, 'Borrador Con Cobro de Prueba');

  await conBase(async (sql) => {
    await sql`INSERT INTO renglon (atencion_id, descripcion, cantidad, precio, moneda, paga)
              VALUES (${caso}, 'Consulta de prueba', 1, 30.00, 'USD', 'paciente')`;
    await sql`UPDATE atencion SET creada = now() - interval '40 days' WHERE id = ${caso}`;
    await sql`UPDATE bitacora SET momento = now() - interval '40 days' WHERE atencion_id = ${caso}`;
  });

  await page.goto('/sistema/borradores');
  await expect(page.locator('main')).toContainText('Borrador Con Cobro de Prueba');

  const sigue = await conBase((sql) => sql`SELECT 1 FROM atencion WHERE id = ${caso}`);
  expect(sigue.length).toBe(1);

  /* Pero a mano sí se puede, y la pantalla avisa de lo que se lleva. */
  await page.goto(`/sistema/atencion/${caso}/borrar`);
  await expect(page.locator('.pierde')).toContainText('renglón de cobro');
  await page.getByRole('button', { name: 'Borrar el borrador' }).click();
  await expect(page).toHaveURL(/\?borrado=1$/);
});

test('la lista avisa de los 20 días', async ({ page }) => {
  await entrar(page, 'medico');
  await abrirBorrador(page, MIO, 'Borrador Para El Aviso de Prueba');
  await page.goto('/sistema/borradores');
  await expect(page.locator('.aviso-dias')).toContainText('20 días');
  await expect(page.locator('.aviso-dias')).toContainText('cobro ni resultados');
});
