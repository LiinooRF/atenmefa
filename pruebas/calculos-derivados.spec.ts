/**
 * Lo que se calcula con lo pedido, aunque no se haya pedido (17-11).
 *
 * «Cálculo de VLDL = triglicéridos ÷ 5, me dijo que faltó.» Con el perfil
 * lipídico ya salía; pedidos sueltos —colesterol, HDL, triglicéridos, que se
 * cobran aparte— el VLDL no tenía renglón. Ahora se agrega y se calcula, y
 * con él el LDL.
 */
import { test, expect, type Page } from '@playwright/test';
import { conBase, entrar, cedulaDePrueba, borrarPacientes, borrarServicios, casillaDelExamen, FICHA } from './apoyo';

const CEDULA = cedulaDePrueba(27, 0);
const CT = 'COLESTEROL TOTAL', HDL = 'HDL-COLESTEROL', TG = 'TRIGLICERIDOS';
const NUEVOS = ['ZD Colesterol', 'ZD HDL', 'ZD Triglicéridos'];
test.afterAll(async () => { await borrarPacientes(CEDULA); await borrarServicios(...NUEVOS); });

const fila = (page: Page, e: string) =>
  page.locator('#res-cuerpo tr').filter({ has: page.locator(`input[name="examen"][value="${e}"]`) });

test('pedidos sueltos, el VLDL y el LDL aparecen y se calculan solos', async ({ page }) => {
  /* Los sueltos se llaman como el analito, igual que en el baremo real. Se
     crean aparte con otro nombre visible y su renglón se llama como el
     analito: así quedaría si el catálogo los nombra igual. */
  await borrarServicios(...NUEVOS);
  await conBase((sql) => sql`INSERT INTO servicio (nombre, categoria, precio, moneda, activo) VALUES
    (${NUEVOS[0]}, 'laboratorio', 3, 'USD', true), (${NUEVOS[1]}, 'laboratorio', 3, 'USD', true),
    (${NUEVOS[2]}, 'laboratorio', 3, 'USD', true)`);
  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}&tipo=laboratorio`);
  await page.locator('#c-nombre').fill('Lípidos Sueltos Prueba');
  await page.locator('#c-edad').fill('40');
  await page.locator('#c-sexo').selectOption('Femenino');
  await page.locator('[data-ir="1"]').click();
  for (const e of NUEVOS) await casillaDelExamen(page, e).check();
  await page.getByRole('button', { name: 'Guardar la orden' }).click();
  await expect(page).toHaveURL(FICHA);
  const orden = page.url().split('/atencion/')[1];
  // Los renglones de la orden, con el nombre del analito, como en el baremo.
  await conBase(async (sql) => {
    for (const [s, a] of [[NUEVOS[0], CT], [NUEVOS[1], HDL], [NUEVOS[2], TG]]) {
      await sql`UPDATE renglon SET descripcion = ${a} WHERE atencion_id = ${orden} AND descripcion = ${s}`;
    }
  });

  await page.context().clearCookies();
  await entrar(page, 'bioanalista');
  await page.goto(`/sistema/atencion/${orden}/resultados`);
  await expect(fila(page, 'VLDL-COLESTEROL')).toHaveCount(1);
  await expect(fila(page, 'LDL-COLESTEROL')).toHaveCount(1);

  await fila(page, CT).locator('[name="valor"]').fill('200');
  await fila(page, HDL).locator('[name="valor"]').fill('50');
  await fila(page, TG).locator('[name="valor"]').fill('150');
  await expect(fila(page, 'VLDL-COLESTEROL').locator('[name="valor"]')).toHaveValue('30,0');
  await expect(fila(page, 'LDL-COLESTEROL').locator('[name="valor"]')).toHaveValue('120,0');
});
