/**
 * Lo que se le agrega a una atención cerrada.
 *
 * El médico no la edita: le suma notas, diagnósticos y exámenes indicados,
 * cada uno con su fecha y su autor. Administración los anula con motivo y
 * nada se borra. Ver 024-agregados.sql.
 *
 * Lo que se vigila, sobre todo, es que la regla viva en el servidor: un
 * formulario armado a mano no le puede escribir a un borrador, y recepción
 * no le puede agregar nada a una historia.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  conBase, entrar, cedulaDePrueba, crearAtencionCerrada, crearBorrador, borrarPacientes,
  sembrarExamen, borrarExamen, casillaDelExamen, FICHA,
} from './apoyo';

test.describe.configure({ mode: 'serial' });

const CEDULA = cedulaDePrueba(19, 0);
const CEDULA_BORRADOR = cedulaDePrueba(19, 1);
const EXAMEN = 'Examen indicado de prueba';
const NOTA = 'Volvió a control: el dolor cedió con el tratamiento.';
const DX = 'Hipertensión arterial de prueba';

let consulta = '';

test.beforeAll(async () => {
  await borrarPacientes(CEDULA, CEDULA_BORRADOR);
  await sembrarExamen(EXAMEN, '5.00');
});

test.afterAll(async () => {
  await borrarPacientes(CEDULA, CEDULA_BORRADOR);
  await borrarExamen(EXAMEN);
});

/** Manda el formulario desde la página, como lo mandaría alguien que lo
    armó a mano: con el origen del sitio, que el servidor exige, y sin pasar
    por lo que la pantalla dibujó. Devuelve el HTML de la respuesta. */
const postearAMano = (page: Page, url: string, campos: Record<string, string>) =>
  page.evaluate(async ({ url, campos }) => {
    const datos = new FormData();
    for (const [k, v] of Object.entries(campos)) datos.append(k, v);
    const r = await fetch(url, { method: 'POST', body: datos });
    return r.text();
  }, { url, campos });

const cuantosAgregados = async (atencion: string) => {
  const [n] = await conBase((sql) => sql`
    SELECT COUNT(*)::int AS n FROM agregado WHERE atencion_id = ${atencion}`);
  return n.n as number;
};

test('el médico le agrega una nota a una consulta cerrada y lo cerrado no cambia', async ({ page }) => {
  await entrar(page, 'medico');
  consulta = await crearAtencionCerrada(page, { cedula: CEDULA, nombre: 'Agregado de Prueba Rivas' });

  const [antes] = await conBase((sql) => sql`
    SELECT datos::text AS datos, estado FROM atencion WHERE id = ${consulta}`);

  await page.goto(`/sistema/atencion/${consulta}`);
  const seccion = page.locator('#agregados');
  await expect(seccion).toContainText('Agregado después del cierre');

  await seccion.locator('input[name="tipo"][value="nota"]').check();
  await page.locator('#nota_texto').fill(NOTA);
  await seccion.getByRole('button', { name: 'Agregar' }).click();

  await expect(page.locator('#agregados .msj--bien')).toContainText('Quedó agregado');
  await expect(page.locator('#agregados .agregado')).toContainText(NOTA);

  /* Lo firmado sigue intacto: ni los datos ni el estado se movieron. */
  const [despues] = await conBase((sql) => sql`
    SELECT datos::text AS datos, estado FROM atencion WHERE id = ${consulta}`);
  expect(despues.datos).toBe(antes.datos);
  expect(despues.estado).toBe('cerrada');
});

test('y le suma un diagnóstico, que sale también en el documento', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${consulta}`);
  const seccion = page.locator('#agregados');
  await seccion.locator('input[name="tipo"][value="diagnostico"]').check();
  // Escrito a mano, sin elegir del catálogo: se guarda sin código.
  await page.locator('#c-dx_agregado').fill(DX);
  await seccion.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.locator('#agregados .agregado')).toHaveCount(2);

  await page.goto(`/sistema/atencion/${consulta}/documento`);
  const agregados = page.locator('.agregados');
  await expect(agregados).toContainText('Agregado después del cierre');
  await expect(agregados).toContainText(NOTA);
  await expect(agregados).toContainText(DX);
});

test('a un borrador no se le agrega nada, aunque el formulario llegue armado a mano', async ({ page }) => {
  await entrar(page, 'medico');
  const borrador = await crearBorrador(page, { cedula: CEDULA_BORRADOR, nombre: 'Borrador de Prueba Rivas' });

  // La pantalla ni lo ofrece.
  await page.goto(`/sistema/atencion/${borrador}`);
  await expect(page.locator('[data-agregar]')).toHaveCount(0);

  // Y el servidor lo rechaza.
  const html = await postearAMano(page, `/sistema/atencion/${borrador}`, {
    accion: 'agregar', tipo: 'nota', nota_texto: 'Esto no debería entrar',
  });
  expect(html).toContain('todavía está abierta');
  expect(await cuantosAgregados(borrador)).toBe(0);
});

test('recepción no agrega: ni ve el formulario ni el servidor la deja', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/${consulta}`);
  await expect(page.locator('#agregados .agregado')).toHaveCount(2);
  await expect(page.locator('[data-agregar]')).toHaveCount(0);

  const html = await postearAMano(page, `/sistema/atencion/${consulta}`, {
    accion: 'agregar', tipo: 'nota', nota_texto: 'Recepción no escribe historias',
  });
  expect(html).toContain('Solo el personal médico');
  expect(await cuantosAgregados(consulta)).toBe(2);
});

test('el médico no anula: eso es de administración', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${consulta}`);
  await expect(page.locator('.agregado__anular')).toHaveCount(0);

  const [nota] = await conBase((sql) => sql`
    SELECT id FROM agregado WHERE atencion_id = ${consulta} AND tipo = 'nota'`);
  const html = await postearAMano(page, `/sistema/atencion/${consulta}`, {
    accion: 'anular_agregado', agregado: nota.id, motivo: 'Me equivoqué',
  });
  expect(html).toContain('Solo administración');
  const [sigue] = await conBase((sql) => sql`SELECT anulado_por FROM agregado WHERE id = ${nota.id}`);
  expect(sigue.anulado_por).toBeNull();
});

test('administración anula la nota con motivo: queda tachada y sale del documento', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/atencion/${consulta}`);

  const nota = page.locator('#agregados .agregado', { hasText: NOTA });
  await nota.locator('summary', { hasText: 'Anular' }).click();
  await nota.getByLabel('¿Por qué se anula?').fill('Era de otro paciente');
  await nota.getByRole('button', { name: 'Anular' }).click();

  await expect(page.locator('#agregados .msj--bien')).toContainText('Quedó anulado');
  // Sigue a la vista, tachada y con su motivo: nada desaparece.
  const anulada = page.locator('#agregados .agregado--anulado');
  await expect(anulada).toContainText(NOTA);
  await expect(anulada).toContainText('Era de otro paciente');

  await page.goto(`/sistema/atencion/${consulta}/documento`);
  await expect(page.locator('.agregados')).not.toContainText(NOTA);
  await expect(page.locator('.agregados')).toContainText(DX);

  // Y queda en la bitácora quién y por qué.
  const [b] = await conBase((sql) => sql`
    SELECT detalle->>'motivo' AS motivo FROM bitacora
     WHERE atencion_id = ${consulta} AND accion = 'anulo_agregado'`);
  expect(b.motivo).toBe('Era de otro paciente');
});

test('el médico indica exámenes y recepción los ve en su cola', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${consulta}`);
  const seccion = page.locator('#agregados');
  await seccion.locator('input[name="tipo"][value="examenes"]').check();
  await page.locator('#examenes_texto').fill(`${EXAMEN}\n\n  Un examen que no está en el catálogo  `);
  await seccion.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.locator('#agregados .agregado', { hasText: EXAMEN })).toBeVisible();
  // El médico no registra la orden: no ve el botón.
  await expect(page.getByRole('link', { name: 'Registrar la orden' })).toHaveCount(0);

  const [ind] = await conBase((sql) => sql`
    SELECT texto FROM agregado WHERE atencion_id = ${consulta} AND tipo = 'examenes'`);
  // Una línea por examen, sin la línea en blanco ni los espacios de más.
  expect(ind.texto).toBe(`${EXAMEN}\nUn examen que no está en el catálogo`);
});

test('recepción registra la orden desde la cola, con lo indicado ya puesto', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await page.goto('/sistema/laboratorio');
  const caja = page.locator('.indicadas li', { hasText: 'Agregado de Prueba Rivas' });
  await expect(caja).toContainText(EXAMEN);
  await caja.getByRole('link', { name: 'Registrar la orden' }).click();

  /* Lo que calza con el catálogo viene marcado y lo demás va a «Otros
     exámenes». Nada se cobra sin que recepción lo vea. */
  await expect(page.locator('#c-examenes')).toHaveValue('Un examen que no está en el catálogo');
  await page.locator('[data-ir="1"]').click();
  await expect(casillaDelExamen(page, EXAMEN)).toBeChecked();
  await page.getByRole('button', { name: 'Guardar la orden' }).click();
  await expect(page).toHaveURL(FICHA);

  const [ind] = await conBase((sql) => sql`
    SELECT a.orden_id, o.origen_id FROM agregado a JOIN atencion o ON o.id = a.orden_id
     WHERE a.atencion_id = ${consulta} AND a.tipo = 'examenes'`);
  expect(ind.origen_id).toBe(consulta);

  // Registrada, sale de la cola.
  await page.goto('/sistema/laboratorio');
  await expect(page.locator('.indicadas li', { hasText: 'Agregado de Prueba Rivas' })).toHaveCount(0);
});
