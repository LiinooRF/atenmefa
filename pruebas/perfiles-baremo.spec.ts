/**
 * Perfiles del baremo: un ítem con precio que trae sus exámenes adentro.
 *
 * «Es como un combo… pero se deben poder deseleccionar algún examen si lo
 * quiero quitar». Al marcar el perfil en la orden se despliegan sus
 * exámenes, todos marcados; se quita el que no va; se cobra el precio del
 * perfil menos el precio suelto de lo quitado, y al laboratorio le llega
 * solo lo que quedó. Ver 031-componentes-de-perfil.sql.
 */
import { test, expect } from '@playwright/test';
import { conBase, entrar, cedulaDePrueba, borrarPacientes, casillaDelExamen, FICHA } from './apoyo';

test.describe.configure({ mode: 'serial' });

const CEDULA = cedulaDePrueba(23, 0);
const PERFIL = 'ZP Perfil de prueba';
const A = 'ZP Examen A';    // se vende suelto a $8
const B = 'ZP Examen B';    // se vende suelto a $6
const C = 'ZP Examen C';    // no se vende suelto
let perfilId = '';
let orden = '';

const limpiar = async () => {
  await borrarPacientes(CEDULA);
  await conBase(async (sql) => {
    await sql`DELETE FROM servicio_componente WHERE servicio_id IN (SELECT id FROM servicio WHERE nombre LIKE 'ZP %')`;
    await sql`DELETE FROM servicio WHERE nombre LIKE 'ZP %'`;
  });
};
test.beforeAll(async () => {
  await limpiar();
  await conBase(async (sql) => {
    const [p] = await sql`
      INSERT INTO servicio (nombre, categoria, precio, moneda, activo)
      VALUES (${PERFIL}, 'laboratorio', 20, 'USD', true) RETURNING id`;
    perfilId = p.id;
    await sql`
      INSERT INTO servicio (nombre, categoria, precio, moneda, activo) VALUES
        (${A}, 'laboratorio', 8, 'USD', true),
        (${B}, 'laboratorio', 6, 'USD', true),
        (${C}, 'laboratorio', 0, 'USD', false)`;
  });
});
test.afterAll(limpiar);

test('administración le dice al perfil qué exámenes trae', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/servicios/${perfilId}`);
  const caja = page.locator('#componentes');
  await caja.locator('#filtro-componentes').fill('zp examen');
  for (const n of [A, B, C]) {
    await caja.locator('li', { hasText: n }).locator('input[name="componente"]').check();
  }
  // El que no se vende suelto igual puede ir en el perfil.
  await expect(caja.locator('li', { hasText: C })).toContainText('no se vende suelto');
  await caja.getByRole('button', { name: 'Guardar los exámenes del perfil' }).click();
  await expect(page.locator('.componentes__ok')).toContainText('trae 3 exámenes');
});

test('recepción marca el perfil, se despliega, quita uno y el total baja', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}&tipo=laboratorio`);
  await page.locator('#c-nombre').fill('Perfil de Baremo Prueba');
  await page.locator('#c-edad').fill('40');
  await page.locator('#c-sexo').selectOption('Femenino');
  await page.locator('[data-ir="1"]').click();

  const lista = page.locator(`.ex__componentes[data-de="${perfilId}"]`);
  await expect(lista).toBeHidden();
  await casillaDelExamen(page, PERFIL).check();
  // Se despliegan los tres, ya marcados.
  await expect(lista).toBeVisible();
  await expect(lista.locator('input:checked')).toHaveCount(3);
  await expect(page.locator('#ex-usd')).toContainText('20,00');

  // Se quita B, que se vende suelto a 6: queda 14.
  await lista.locator('li', { hasText: B }).locator('input').uncheck();
  await expect(page.locator('#ex-usd')).toContainText('14,00');
  // Quitar C, que no se vende suelto, no descuenta nada.
  await lista.locator('li', { hasText: C }).locator('input').uncheck();
  await expect(page.locator('#ex-usd')).toContainText('14,00');
  await lista.locator('li', { hasText: C }).locator('input').check();

  await page.getByRole('button', { name: 'Guardar la orden' }).click();
  await expect(page).toHaveURL(FICHA);
  orden = page.url().split('/atencion/')[1].split(/[/?#]/)[0];

  const [r] = await conBase((sql) => sql`
    SELECT precio::text AS precio, descripcion, incluye::text[] AS incluye
      FROM renglon WHERE atencion_id = ${orden}`);
  expect(r.precio).toBe('14.00');
  expect(r.descripcion).toBe(`${PERFIL} (sin ${B})`);
  expect(r.incluye).toHaveLength(2);
});

test('la orden se reabre como se guardó', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/${orden}/editar?paso=1`);
  const lista = page.locator(`.ex__componentes[data-de="${perfilId}"]`);
  await expect(lista).toBeVisible();
  await expect(lista.locator('li', { hasText: B }).locator('input')).not.toBeChecked();
  await expect(lista.locator('li', { hasText: A }).locator('input')).toBeChecked();
});

test('al laboratorio le llegan solo los exámenes que quedaron', async ({ page }) => {
  await entrar(page, 'bioanalista');
  await page.goto(`/sistema/atencion/${orden}/resultados`);
  const nombres = await page.locator('#res-cuerpo input[name="examen"]')
    .evaluateAll((is) => is.map((i) => (i as HTMLInputElement).value));
  expect(nombres).toEqual([`${PERFIL} (sin ${B})`, A, C]);
});

test('quitarle todos es no pedir el perfil', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(cedulaDePrueba(23, 1))}&tipo=laboratorio`);
  await page.locator('[data-ir="1"]').click();
  await casillaDelExamen(page, PERFIL).check();
  const lista = page.locator(`.ex__componentes[data-de="${perfilId}"]`);
  for (const n of [A, B, C]) await lista.locator('li', { hasText: n }).locator('input').uncheck();
  await expect(casillaDelExamen(page, PERFIL)).not.toBeChecked();
  await expect(lista).toBeHidden();
});

test('un ítem con hoja trae los renglones de su hoja y se le quita uno', async ({ page }) => {
  /* «Cada hoja hay un perfil definido»: un ítem enlazado a la hoja HEMA
     trae sus doce renglones. Las plaquetas no se venden sueltas: quitarlas
     no descuenta, pero no se hacen.

     El ítem se arma acá, como lo arma 031-componentes-de-perfil.sql, y no
     se usa el del baremo: otra prueba vacía el catálogo de laboratorio
     para probar la carga desde cero. */
  const cedula = cedulaDePrueba(23, 2);
  const creados: string[] = [];
  const hemaId = await conBase(async (sql) => {
    const [p] = await sql`
      INSERT INTO servicio (nombre, categoria, precio, moneda, activo, plantilla)
      VALUES ('ZP Hematología', 'laboratorio', 4, 'USD', true, 'HEMA') RETURNING id`;
    const renglones = await sql`
      SELECT btrim(analito) AS analito, min(orden) AS orden FROM plantilla_examen
       WHERE examen = 'HEMA' AND tipo = 'analito' AND btrim(analito) <> ''
       GROUP BY btrim(analito) ORDER BY min(orden)`;
    for (const r of renglones) {
      let [c] = await sql`SELECT id FROM servicio WHERE categoria = 'laboratorio' AND upper(nombre) = upper(${r.analito})`;
      if (!c) {
        [c] = await sql`INSERT INTO servicio (nombre, categoria, precio, moneda, activo)
                        VALUES (${r.analito}, 'laboratorio', 0, 'USD', false) RETURNING id`;
        creados.push(c.id);
      }
      await sql`INSERT INTO servicio_componente (servicio_id, componente_id, orden)
                VALUES (${p.id}, ${c.id}, ${r.orden}) ON CONFLICT DO NOTHING`;
    }
    return p.id as string;
  });

  try {
    await entrar(page, 'recepcionista');
    await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(cedula)}&tipo=laboratorio`);
    await page.locator('#c-nombre').fill('Hoja de Baremo Prueba');
    await page.locator('#c-edad').fill('30');
    await page.locator('#c-sexo').selectOption('Masculino');
    await page.locator('[data-ir="1"]').click();
    await casillaDelExamen(page, 'ZP Hematología').check();

    const lista = page.locator(`.ex__componentes[data-de="${hemaId}"]`);
    await expect(lista.locator('input:checked')).toHaveCount(12);
    await lista.locator('li', { hasText: 'PLAQUETAS' }).locator('input').uncheck();
    await page.getByRole('button', { name: 'Guardar la orden' }).click();
    await expect(page).toHaveURL(FICHA);
    const ordenHema = page.url().split('/atencion/')[1].split(/[/?#]/)[0];

    await page.context().clearCookies();
    await entrar(page, 'bioanalista');
    await page.goto(`/sistema/atencion/${ordenHema}/resultados`);
    const nombres = await page.locator('#res-cuerpo input[name="examen"]')
      .evaluateAll((is) => is.map((i) => (i as HTMLInputElement).value));
    expect(nombres).toContain('HEMOGLOBINA');
    expect(nombres).toContain('LEUCOCITOS');
    expect(nombres).not.toContain('PLAQUETAS');
  } finally {
    await borrarPacientes(cedula);
    await conBase(async (sql) => {
      await sql`DELETE FROM servicio WHERE id = ${hemaId}`;
      if (creados.length) await sql`DELETE FROM servicio WHERE id = ANY(${creados}::uuid[])`;
    });
  }
});
