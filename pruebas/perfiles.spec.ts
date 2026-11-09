/**
 * Perfiles: combos de exámenes.
 *
 * El cliente lo explicó con una hamburguesa: «es como un combo con papas y
 * Coca-Cola, pero se deben poder deseleccionar algún examen si lo quiero
 * quitar, porque un perfil puede tener 5 exámenes y yo solo quiero 3».
 *
 * Lo que se vigila, y es todo lo mismo: que el perfil marque y que lo que
 * se cobre sea lo que QUEDE marcado. Un combo con precio fijo cobraría los
 * cinco igual, y eso es justo lo que no puede pasar.
 */
import { test, expect } from '@playwright/test';
import {
  conBase, entrar, cedulaDePrueba, borrarPacientes, FICHA, llenar, hoyEnCaracas,
} from './apoyo';

test.describe.configure({ mode: 'serial' });

const CEDULA = cedulaDePrueba(17, 0);

test.beforeAll(async () => {
  /* El catálogo y los perfiles salen del archivo del laboratorio. Se cargan
     por la pantalla de administración, que es el camino de verdad. */
  await conBase(async (sql) => {
    await sql`DELETE FROM perfil_examen`;
    await sql`DELETE FROM perfil`;
    await sql`DELETE FROM renglon WHERE servicio_id IN (
                SELECT id FROM servicio WHERE categoria = 'laboratorio')`;
    await sql`DELETE FROM servicio WHERE categoria = 'laboratorio'`;
  });
});

test.afterAll(async () => {
  await borrarPacientes(CEDULA);
  await conBase(async (sql) => {
    await sql`DELETE FROM perfil_examen`;
    await sql`DELETE FROM perfil`;
  });
});

test('administración carga los exámenes y los perfiles del archivo', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/servicios');
  await page.getByRole('button', { name: /Cargar/ }).click();
  await expect(page.locator('.msj--bien')).toContainText('141 exámenes, todos sin precio');
  await expect(page.locator('.msj--bien')).toContainText('31 perfiles');

  const [n] = await conBase((sql) => sql`
    SELECT (SELECT COUNT(*)::int FROM servicio WHERE categoria = 'laboratorio') AS examenes,
           (SELECT COUNT(*)::int FROM perfil) AS perfiles`);
  /* 141 determinaciones y 31 perfiles: las hojas de su archivo con más de
     un analito son perfiles, las de uno solo son exámenes sueltos. */
  expect(n.examenes).toBe(141);
  expect(n.perfiles).toBe(31);

  /* El perfil lipídico trae sus cinco, los mismos que su hoja. Es el
     ejemplo que él usó: «un perfil puede tener 5 exámenes». */
  const lip = await conBase((sql) => sql`
    SELECT s.nombre FROM perfil p
      JOIN perfil_examen pe ON pe.perfil_id = p.id
      JOIN servicio s ON s.id = pe.servicio_id
     WHERE p.nombre_busca = 'perfil lipidico' ORDER BY pe.orden`);
  expect(lip.map((x) => x.nombre)).toEqual([
    'COLESTEROL TOTAL', 'HDL-COLESTEROL', 'LDL-COLESTEROL', 'VLDL-COLESTEROL', 'TRIGLICERIDOS',
  ]);

  /* Los rótulos de sección de sus hojas no son exámenes y no entraron al
     catálogo: «ANALISIS QUIMICO:» no se le cobra a nadie. */
  const basura = await conBase((sql) => sql`
    SELECT 1 FROM servicio WHERE nombre IN ('ANALISIS QUIMICO:', 'CARACTERES FISICOS:', 'TIPO DE MUESTRA:')`);
  expect(basura.length).toBe(0);
});

test('un perfil marca sus exámenes y se puede quitar cualquiera', async ({ page }) => {
  /* Para poder sumar hace falta un precio: se le pone a tres de los cinco
     del perfil lipídico, y los otros dos quedan en cero. */
  await conBase((sql) => sql`
    UPDATE servicio SET precio = 10.00
     WHERE nombre IN ('COLESTEROL TOTAL', 'HDL-COLESTEROL', 'TRIGLICERIDOS')`);
  await conBase((sql) => sql`
    INSERT INTO tasa (fecha, bolivares) VALUES (${hoyEnCaracas()}, 40.000000)
    ON CONFLICT (fecha) DO UPDATE SET bolivares = 40.000000`);

  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}`);
  await llenar(page, { nombre: 'Perfil de Prueba Carrasco', edad: '38', sexo: 'Femenino' });
  await page.locator('[data-ir="1"]').click();

  const boton = page.locator('.ex__perfil', { hasText: 'PERFIL LIPIDICO' });
  await expect(boton).toHaveAttribute('data-estado', 'nada');

  // Un toque y quedan los cinco.
  await boton.click();
  await expect(boton).toHaveAttribute('data-estado', 'todo');
  expect(await page.locator('input[name="examen"]:checked').count()).toBe(5);
  // Tres con precio de 10: 30,00, y los otros dos avisados aparte.
  await expect(page.locator('#ex-cuantos')).toHaveText('5 exámenes');
  await expect(page.locator('#ex-usd')).toContainText('30,00');
  await expect(page.locator('#ex-usd')).toContainText('2 sin precio');

  /* Y se quita uno: el combo baja. Es lo que el cliente pidió —«un perfil
     puede tener 5 y yo solo quiero 3»— y la razón por la que el perfil no
     tiene precio propio. */
  await page.locator('.ex__lista li', { hasText: 'HDL-COLESTEROL' })
    .locator('input[name="examen"]').uncheck();
  await expect(boton).toHaveAttribute('data-estado', 'parte');
  await expect(page.locator('#ex-cuantos')).toHaveText('4 exámenes');
  await expect(page.locator('#ex-usd')).toContainText('20,00');

  await page.getByRole('button', { name: 'Guardar la orden' }).click();
  await expect(page).toHaveURL(FICHA);

  // Se cobran cuatro, no cinco.
  const renglones = await conBase((sql) => sql`
    SELECT r.descripcion FROM renglon r
      JOIN atencion a ON a.id = r.atencion_id
      JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${CEDULA.replace(/\D/g, '')} ORDER BY r.descripcion`);
  expect(renglones.length).toBe(4);
  expect(renglones.map((r) => r.descripcion)).not.toContain('HDL-COLESTEROL');
});

test('tocar el perfil otra vez lo quita entero', async ({ page }) => {
  await entrar(page, 'recepcionista');
  const [orden] = await conBase((sql) => sql`
    SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${CEDULA.replace(/\D/g, '')}`);
  await page.goto(`/sistema/atencion/${orden.id}/editar?paso=1`);

  const boton = page.locator('.ex__perfil', { hasText: 'PERFIL LIPIDICO' });
  // Venía a medias: el primer toque completa.
  await expect(boton).toHaveAttribute('data-estado', 'parte');
  await boton.click();
  await expect(boton).toHaveAttribute('data-estado', 'todo');
  // Y el segundo los quita todos: es el camino de vuelta.
  await boton.click();
  await expect(boton).toHaveAttribute('data-estado', 'nada');
  expect(await page.locator('input[name="examen"]:checked').count()).toBe(0);
});

test('el filtro no esconde lo que ya está marcado', async ({ page }) => {
  /* Perder de vista un examen ya elegido porque no calza con el filtro es
     como se cobra de menos. */
  await entrar(page, 'recepcionista');
  const [orden] = await conBase((sql) => sql`
    SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${CEDULA.replace(/\D/g, '')}`);
  await page.goto(`/sistema/atencion/${orden.id}/editar?paso=1`);

  const fila = page.locator('.ex__lista li', { hasText: 'GLICEMIA' }).first();
  await fila.locator('input[name="examen"]').check();

  await page.locator('#ex-filtro').fill('colesterol');
  await expect(page.locator('#ex-filtrados')).toContainText('de 141');
  // Sigue visible aunque no diga «colesterol».
  await expect(fila).toBeVisible();
});

/* ------------------------------------------------------------------
   Armar uno a mano.
   ------------------------------------------------------------------ */

test('administración crea un perfil y le elige los exámenes', async ({ page }) => {
  /* Él nombró cinco y tres no existen como hoja en su archivo: el control
     prenatal lo arma él, no se inventa qué lleva. */
  await entrar(page, 'administracion');
  await page.goto('/sistema/perfiles');

  await expect(page.locator('.suelto--nota').first()).toContainText('Control prenatal');

  await page.getByLabel('Un perfil nuevo').fill('Control prenatal');
  await page.getByRole('button', { name: 'Crear' }).click();
  await expect(page).toHaveURL(/\?editar=[0-9a-f-]{36}&nuevo=1$/);

  for (const examen of ['GLICEMIA', 'UREA', 'TOXOPLASMA (IgG)']) {
    await page.locator('.examenes li', { hasText: examen }).first()
      .locator('input[type="checkbox"]').check();
  }
  await page.getByRole('button', { name: 'Guardar el perfil' }).click();
  /* `.first()`: al guardar quedan dos avisos, el de «perfil creado» de la
     redirección y el del guardado. */
  await expect(page.locator('.msj--bien').first()).toContainText('3 exámenes');

  const suyos = await conBase((sql) => sql`
    SELECT s.nombre FROM perfil p
      JOIN perfil_examen pe ON pe.perfil_id = p.id
      JOIN servicio s ON s.id = pe.servicio_id
     WHERE p.nombre_busca = 'control prenatal' ORDER BY s.nombre`);
  expect(suyos.length).toBe(3);
});

test('el nombre de un perfil no se repite', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/perfiles');
  await page.getByLabel('Un perfil nuevo').fill('control PRENATAL');
  await page.getByRole('button', { name: 'Crear' }).click();
  await expect(page.locator('.sis-error')).toContainText('Ya hay un perfil');
});

test('se renombra, porque los del archivo traen el nombre de la pestaña', async ({ page }) => {
  await entrar(page, 'administracion');
  const [p] = await conBase((sql) => sql`SELECT id FROM perfil WHERE nombre_busca = 'coag.'`);
  await page.goto(`/sistema/perfiles?editar=${p.id}`);

  await page.getByLabel('Nombre').fill('Perfil de coagulación');
  await page.getByRole('button', { name: 'Guardar el perfil' }).click();
  await expect(page.locator('.msj--bien')).toContainText('Perfil de coagulación');

  const [ahora] = await conBase((sql) => sql`
    SELECT nombre, nombre_busca FROM perfil WHERE id = ${p.id}`);
  expect(ahora.nombre).toBe('Perfil de coagulación');
  expect(ahora.nombre_busca).toBe('perfil de coagulacion');
});

test('administración apaga un perfil', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/perfiles');
  await page.locator('.lista li', { hasText: 'PERFIL TIROIDEO' })
    .getByRole('button', { name: 'Apagar' }).click();
  await expect(page.locator('.msj--bien')).toContainText('ya no sale en la orden');
});

test('un perfil apagado no sale en la orden', async ({ page }) => {
  /* En su propia prueba: dos sesiones en una no se pueden, entrar() cuenta
     con llegar al formulario de login y con una sesión abierta
     /sistema/entrar redirige al panel. */
  await entrar(page, 'recepcionista');
  const [orden] = await conBase((sql) => sql`
    SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${CEDULA.replace(/\D/g, '')}`);
  await page.goto(`/sistema/atencion/${orden.id}/editar?paso=1`);
  await expect(page.locator('.ex__perfil', { hasText: 'PERFIL TIROIDEO' })).toHaveCount(0);
  // Pero sigue existiendo: nada se borra.
  const [sigue] = await conBase((sql) => sql`
    SELECT activo FROM perfil WHERE nombre_busca = 'perfil tiroideo'`);
  expect(sigue.activo).toBe(false);
});

test('el médico no administra los perfiles', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/perfiles');
  await expect(page).toHaveURL(/\/sistema\/sin-permiso/);
});
