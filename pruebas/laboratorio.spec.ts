/**
 * La atención de laboratorio.
 *
 * Después de la cédula se pregunta qué se le va a hacer: atención general o
 * laboratorio. El laboratorio es el mismo expediente con otro formulario —dos
 * pasos en vez de nueve— porque no hay examen físico ni diagnóstico que
 * escribir, solo a quién se le toma la muestra y qué se le pidió.
 *
 * ESTO ESTÁ A MEDIO HACER a propósito: el cliente quedó en mandar un video
 * con cómo trabaja su laboratorio. Lo que se prueba acá es el armazón, que
 * es lo que tiene que seguir en pie cuando llegue el video.
 */
import { test, expect } from '@playwright/test';
import { conBase, entrar, cedulaDePrueba } from './apoyo';

test.describe.configure({ mode: 'serial' });

const CEDULA = cedulaDePrueba(13, 0);
const CEDULA_GENERAL = cedulaDePrueba(13, 1);
const NOMBRE = 'Carmen Rosa Laboratorio de Prueba';

const limpiar = () =>
  conBase(async (sql) => {
    for (const c of [CEDULA, CEDULA_GENERAL]) {
      const busca = c.replace(/\D/g, '');
      const suyas = sql`SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
                         WHERE p.cedula_busca = ${busca}`;
      await sql`DELETE FROM bitacora WHERE atencion_id IN (${suyas})`;
      await sql`DELETE FROM renglon  WHERE atencion_id IN (${suyas})`;
      await sql`DELETE FROM atencion WHERE paciente_id IN (
                  SELECT id FROM paciente WHERE cedula_busca = ${busca})`;
      await sql`DELETE FROM paciente WHERE cedula_busca = ${busca}`;
    }
  });

test.beforeAll(limpiar);
test.afterAll(limpiar);

test('después de la cédula pregunta qué se le va a hacer', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}`);

  /* La pregunta llega DESPUÉS del paciente y no antes: con la cédula ya
     resuelta, la elección se hace con la persona en pantalla. */
  await expect(page.getByRole('heading', { name: '¿Qué se le va a hacer?' })).toBeVisible();
  expect(await page.locator('.clase strong').allInnerTexts())
    .toEqual(['Atención general', 'Laboratorio']);

  // Todavía no hay formulario: primero se elige.
  await expect(page.locator('#c-nombre')).toHaveCount(0);
});

test('el formulario de laboratorio tiene dos pasos y ningún campo clínico', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}&tipo=laboratorio`);

  const pasos = await page.locator('[data-ir]').allInnerTexts();
  expect(pasos.map((p) => p.replace(/\s+/g, ' ').trim())).toEqual(['1 Registro', '2 Exámenes']);

  /* Nada de examen físico ni diagnóstico: en una toma de muestra no se
     escriben, y dejarlos sería pedirle al laboratorio que llene una historia
     clínica que no le toca. */
  await expect(page.locator('#c-abdomen')).toHaveCount(0);
  await expect(page.locator('#c-idx')).toHaveCount(0);      // el diagnóstico
  await expect(page.locator('#c-examenes')).toHaveCount(1);
});

test('la atención general sigue teniendo su formulario completo', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA_GENERAL)}&tipo=general`);

  expect(await page.locator('[data-ir]').count()).toBeGreaterThan(5);
  await expect(page.locator('#c-idx')).toHaveCount(1);       // el diagnóstico
});

test('lo de laboratorio se guarda como laboratorio, y una sola vez', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}&tipo=laboratorio`);

  await page.locator('#c-nombre').fill(NOMBRE);
  await page.locator('#c-edad').fill('45');
  await page.locator('#c-sexo').selectOption('Femenino');

  /* Sin pausas a propósito. Cambiar de paso dispara un guardado, y apretar
     "Guardar y salir" enseguida enviaba el formulario con el id todavía
     vacío: el servidor creaba una SEGUNDA atención del mismo paciente. Dos
     historias clínicas para una visita. */
  await page.locator('[data-ir="1"]').click();
  await page.locator('#c-examenes').fill('Hematología completa\nGlicemia');
  await page.getByRole('button', { name: 'Guardar y salir' }).click();
  await expect(page).toHaveURL(/\/sistema\/atencion\/[0-9a-f-]{36}$/);

  const suyas = await conBase((sql) => sql`
    SELECT a.tipo, a.estado, a.datos->>'examenes' AS ex
      FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${CEDULA.replace(/\D/g, '')}`);

  expect(suyas.length, 'se creó más de una atención para la misma visita').toBe(1);
  expect(suyas[0].tipo).toBe('laboratorio');
  expect(String(suyas[0].ex)).toContain('Hematología completa');
});

test('el tipo elegido sobrevive al guardado automático', async ({ page }) => {
  /* Quien crea la atención suele ser el guardado automático, que no sabe de
     qué pantalla salió: el tipo viaja en el formulario. Sin eso, todo lo de
     laboratorio quedaba guardado como atención general. */
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}&tipo=laboratorio`);

  await expect(page.locator('input[name="tipo_atencion"]')).toHaveValue('laboratorio');
  await expect(page.locator('input[name="tipo_doc"]')).toHaveValue('cedula');
});
