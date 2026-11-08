/**
 * El laboratorio, con los cuatro roles.
 *
 * Lo que el cliente definió en audio y lo que se vigila acá:
 *
 *   · «sería administrador, médico, bioanalista y recepcionista». El médico
 *     no carga resultados y el bioanalista no escribe historias clínicas:
 *     «el médico va a poder hacer la atención y el bioanalista la del
 *     laboratorio»;
 *   · «la gente que llega para el laboratorio no es necesario que le salga
 *     al médico». Las órdenes no aparecen entre los casos ni entre los
 *     borradores;
 *   · lo que el médico sí pidió en su consulta se le anexa: la orden queda
 *     colgada de esa consulta y el resultado vuelve ahí;
 *   · marcar un examen ES cargarlo a la cuenta, «y que les genere el precio
 *     en bolívar y en dólares, automáticamente»;
 *   · la orden la registra un turno y los resultados los carga otro.
 *
 * Los valores de referencia no se prueban contra ninguna lista porque no
 * hay lista: el cliente quedó en mandar su Excel y hasta entonces se
 * escriben. Lo que sí se prueba es que viajen y se impriman.
 */
import { test, expect } from '@playwright/test';
import {
  conBase, entrar, cedulaDePrueba, sembrarExamen, borrarExamen, idDeLaFicha, FICHA,
} from './apoyo';

test.describe.configure({ mode: 'serial' });

const CEDULA = cedulaDePrueba(13, 0);
const CEDULA_GENERAL = cedulaDePrueba(13, 1);
const CEDULA_PEDIDOS = cedulaDePrueba(13, 2);
const NOMBRE = 'Carmen Rosa Laboratorio de Prueba';

const EXAMEN_A = 'Hematología completa de prueba';
const EXAMEN_B = 'Glicemia de prueba';

const limpiar = () =>
  conBase(async (sql) => {
    for (const c of [CEDULA, CEDULA_GENERAL, CEDULA_PEDIDOS]) {
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

test.beforeAll(async () => {
  await limpiar();
  await sembrarExamen(EXAMEN_A, '15.00');
  await sembrarExamen(EXAMEN_B, '5.50');
  /* La tasa del día, sembrada: la suite no sale a internet (SIN_RED=1) y sin
     tasa la pantalla no puede decir cuánto es en bolívares. */
  await conBase(async (sql) => {
    await sql`INSERT INTO tasa (fecha, bolivares)
              VALUES (CURRENT_DATE, 40.000000)
              ON CONFLICT (fecha) DO UPDATE SET bolivares = 40.000000`;
  });
});

test.afterAll(async () => {
  await limpiar();
  await borrarExamen(EXAMEN_A, EXAMEN_B);
});

/* ------------------------------------------------------------------
   La puerta.
   ------------------------------------------------------------------ */

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

test('a recepción no se le pregunta: solo puede laboratorio', async ({ page }) => {
  /* Con un solo camino posible, preguntar es un paso de más y dos botones de
     los cuales uno no sirve. */
  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}`);

  await expect(page.getByRole('heading', { name: '¿Qué se le va a hacer?' })).toHaveCount(0);
  await expect(page.locator('#c-nombre')).toBeVisible();
  await expect(page.locator('input[name="tipo_atencion"]')).toHaveValue('laboratorio');
});

test('recepción no puede abrir el formulario de la historia clínica', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}&tipo=general`);
  // Se le da lo único que puede hacer en vez de un 403 seco.
  await expect(page.locator('input[name="tipo_atencion"]')).toHaveValue('laboratorio');
  await expect(page.locator('#c-idx')).toHaveCount(0);
});

/* ------------------------------------------------------------------
   El formulario.
   ------------------------------------------------------------------ */

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

  /* Y no se cierra desde acá: la cierra el bioanalista cuando los
     resultados están listos. */
  await expect(page.locator('#pasos-cerrar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guardar la orden' })).toBeVisible();
});

test('los exámenes se marcan de una lista y dicen cuánto es en las dos monedas', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}&tipo=laboratorio`);
  await page.locator('[data-ir="1"]').click();

  await expect(page.locator('#ex-nada')).toBeVisible();

  await page.locator(`input[name="examen"]`).first().check();
  await expect(page.locator('#ex-total')).toBeVisible();

  // Los dos marcados: 15,00 + 5,50 = 20,50 USD, y a 40 Bs/$ son 820,00.
  await page.locator('input[name="examen"]').nth(1).check();
  await expect(page.locator('#ex-cuantos')).toHaveText('2 exámenes');
  await expect(page.locator('#ex-usd')).toHaveText('20,50');
  await expect(page.locator('#ex-ves')).toHaveText('820,00');
});

test('marcar un examen lo carga a la cuenta, y una sola vez', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}&tipo=laboratorio`);

  await page.locator('#c-nombre').fill(NOMBRE);
  await page.locator('#c-edad').fill('45');
  await page.locator('#c-sexo').selectOption('Femenino');
  await page.locator('#c-correo').fill('carmen.prueba@correo.local');

  /* Sin pausas a propósito. Cambiar de paso dispara un guardado, y apretar
     "Guardar la orden" enseguida enviaba el formulario con el id todavía
     vacío: el servidor creaba una SEGUNDA atención del mismo paciente. */
  await page.locator('[data-ir="1"]').click();
  await page.locator('input[name="examen"]').first().check();
  await page.locator('input[name="examen"]').nth(1).check();
  await page.getByRole('button', { name: 'Guardar la orden' }).click();
  await expect(page).toHaveURL(FICHA);

  const suyas = await conBase((sql) => sql`
    SELECT a.id, a.tipo::text AS tipo, a.estado::text AS estado, a.origen_id
      FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${CEDULA.replace(/\D/g, '')}`);

  expect(suyas.length, 'se creó más de una atención para la misma visita').toBe(1);
  expect(suyas[0].tipo).toBe('laboratorio');
  expect(suyas[0].estado).toBe('borrador');
  expect(suyas[0].origen_id, 'esta no salió de ninguna consulta').toBeNull();

  /* Los renglones: uno por examen marcado y ni uno más, aunque el guardado
     automático haya corrido varias veces mientras recepción escribía. */
  const renglones = await conBase((sql) => sql`
    SELECT descripcion, precio::text AS precio, moneda
      FROM renglon WHERE atencion_id = ${suyas[0].id} ORDER BY descripcion`);
  expect(renglones.map((r) => r.descripcion)).toEqual([EXAMEN_B, EXAMEN_A].sort());
  expect(renglones.every((r) => r.moneda === 'USD')).toBe(true);

  /* Y el correo quedó en la ficha del paciente, que es de donde lo toma el
     botón de enviar. */
  const [persona] = await conBase((sql) => sql`
    SELECT correo FROM paciente WHERE cedula_busca = ${CEDULA.replace(/\D/g, '')}`);
  expect(persona.correo).toBe('carmen.prueba@correo.local');
});

test('destildar un examen lo quita de la cuenta', async ({ page }) => {
  /* El caso que de verdad importa: el formulario se guarda solo y manda la
     lista completa cada vez. Si esto insertara sin comparar, la cuenta
     crecería sola y el paciente pagaría cinco veces lo mismo. */
  await entrar(page, 'recepcionista');

  const [orden] = await conBase((sql) => sql`
    SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${CEDULA.replace(/\D/g, '')} AND a.tipo = 'laboratorio'`);

  await page.goto(`/sistema/atencion/${orden.id}/editar?paso=1`);
  await page.locator('input[name="examen"]').first().uncheck();
  await page.getByRole('button', { name: 'Guardar la orden' }).click();
  await expect(page).toHaveURL(FICHA);

  const renglones = await conBase((sql) => sql`
    SELECT descripcion FROM renglon WHERE atencion_id = ${orden.id}`);
  expect(renglones.length).toBe(1);
});

/* ------------------------------------------------------------------
   Los resultados.
   ------------------------------------------------------------------ */

/* Dos pruebas y no una con dos sesiones: entrar() cuenta con llegar a la
   pantalla de login, y con una sesión ya abierta /sistema/entrar redirige
   al panel. Cada prueba trae su propio contexto limpio. */
test('el médico no carga resultados', async ({ page }) => {
  const [orden] = await conBase((sql) => sql`
    SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${CEDULA.replace(/\D/g, '')} AND a.tipo = 'laboratorio'`);

  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${orden.id}/resultados`);
  await expect(page).toHaveURL(/\/sistema\/sin-permiso/);
  await expect(page.locator('body')).toContainText('bioanalista');
});

test('el bioanalista sí', async ({ page }) => {
  const [orden] = await conBase((sql) => sql`
    SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${CEDULA.replace(/\D/g, '')} AND a.tipo = 'laboratorio'`);

  await entrar(page, 'bioanalista');
  await page.goto(`/sistema/atencion/${orden.id}/resultados`);
  await expect(page.getByRole('heading', { name: /Resultados · orden/ })).toBeVisible();
});

test('las líneas arrancan con lo que se pidió y se pueden agregar más', async ({ page }) => {
  const [orden] = await conBase((sql) => sql`
    SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${CEDULA.replace(/\D/g, '')} AND a.tipo = 'laboratorio'`);

  await entrar(page, 'bioanalista');
  await page.goto(`/sistema/atencion/${orden.id}/resultados`);

  /* Quedó un solo examen marcado tras el destildado. Una hematología da
     varios valores, así que se agregan líneas. */
  await expect(page.locator('#res-cuerpo tr')).toHaveCount(1);
  await page.locator('#res-mas').click();
  await expect(page.locator('#res-cuerpo tr')).toHaveCount(2);

  await page.locator('#res-cuerpo tr').nth(1).locator('input[name="examen"]').fill('Hemoglobina');
  await page.locator('#res-cuerpo tr').nth(1).locator('input[name="valor"]').fill('13,4');
  await page.locator('#res-cuerpo tr').nth(1).locator('input[name="unidad"]').fill('g/dL');
  await page.locator('#res-cuerpo tr').nth(1).locator('input[name="referencia"]').fill('12,0 - 16,0');

  await page.getByRole('button', { name: 'Guardar y seguir después' }).click();
  await expect(page.locator('.form__aviso--bien')).toContainText('sigue abierta');

  const [guardada] = await conBase((sql) => sql`
    SELECT estado::text AS estado, resultados FROM atencion WHERE id = ${orden.id}`);
  expect(guardada.estado, 'guardar no debe entregar la orden').toBe('borrador');
  const filas = guardada.resultados as { examen: string; valor: string; referencia: string }[];
  expect(filas.find((f) => f.examen === 'Hemoglobina')).toMatchObject({
    valor: '13,4', unidad: 'g/dL', referencia: '12,0 - 16,0',
  });
});

test('un valor sin nombre no se descarta en silencio: se pide nombrarlo', async ({ page }) => {
  const [orden] = await conBase((sql) => sql`
    SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${CEDULA.replace(/\D/g, '')} AND a.tipo = 'laboratorio'`);

  await entrar(page, 'bioanalista');
  await page.goto(`/sistema/atencion/${orden.id}/resultados`);

  await page.locator('#res-mas').click();
  const nueva = page.locator('#res-cuerpo tr').last();
  await nueva.locator('input[name="valor"]').fill('7,2');

  await page.getByRole('button', { name: 'Dar por listos' }).click();
  await expect(page.locator('.sis-error')).toContainText('sin decir de qué examen');
  // Y el valor sigue en pantalla: no se lo tragó.
  await expect(page.locator('#res-cuerpo input[name="valor"]').last()).toHaveValue('7,2');
});

test('darlos por listos la entrega y queda firmada por el bioanalista', async ({ page }) => {
  const [orden] = await conBase((sql) => sql`
    SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${CEDULA.replace(/\D/g, '')} AND a.tipo = 'laboratorio'`);

  await entrar(page, 'bioanalista');
  await page.goto(`/sistema/atencion/${orden.id}/resultados`);
  await page.getByRole('button', { name: 'Dar por listos' }).click();
  await expect(page).toHaveURL(FICHA);

  const [entregada] = await conBase((sql) => sql`
    SELECT a.estado::text AS estado, a.resultados_en, u.name AS firma, u.rol
      FROM atencion a JOIN "user" u ON u.id = a.resultados_por
     WHERE a.id = ${orden.id}`);
  expect(entregada.estado).toBe('cerrada');
  expect(entregada.rol, 'la firma del informe es la del bioanalista').toBe('bioanalista');
  expect(entregada.resultados_en).not.toBeNull();

  /* Y quien registró la orden sigue siendo recepción: son dos personas
     distintas y el papel tiene que poder decir las dos. */
  const [quien] = await conBase((sql) => sql`
    SELECT u.rol FROM atencion a JOIN "user" u ON u.id = a.medico_id WHERE a.id = ${orden.id}`);
  expect(quien.rol).toBe('recepcionista');
});

test('una orden entregada no se vuelve a cargar', async ({ page }) => {
  const [orden] = await conBase((sql) => sql`
    SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${CEDULA.replace(/\D/g, '')} AND a.tipo = 'laboratorio'`);

  await entrar(page, 'bioanalista');
  await page.goto(`/sistema/atencion/${orden.id}/resultados`);
  await expect(page.getByRole('heading', { name: 'Esta orden ya está entregada' })).toBeVisible();
  await expect(page.locator('#res-cuerpo')).toHaveCount(0);
});

/* ------------------------------------------------------------------
   Que no se cruce con la consulta.
   ------------------------------------------------------------------ */

test('la orden no aparece entre los casos ni entre los borradores del médico', async ({ page }) => {
  await entrar(page, 'medico');

  /* Se mira <main> y no .casos: con la lista vacía ese contenedor no
     existe, y un "no contiene" sobre algo que no está no prueba nada. */
  await page.goto('/sistema');
  await expect(page.locator('main')).not.toContainText(NOMBRE);

  await page.goto('/sistema/borradores');
  await expect(page.locator('main')).not.toContainText(NOMBRE);
});

test('el médico no tiene el laboratorio en su menú', async ({ page }) => {
  await entrar(page, 'medico');
  await expect(page.locator('.sis__barra')).not.toContainText('Laboratorio');
});

test('el bioanalista lo tiene', async ({ page }) => {
  await entrar(page, 'bioanalista');
  await expect(page.locator('.sis__barra')).toContainText('Laboratorio');
});

test('recepción también', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await expect(page.locator('.sis__barra')).toContainText('Laboratorio');
});

test('la cola pone lo más viejo arriba', async ({ page }) => {
  await entrar(page, 'bioanalista');
  await page.goto('/sistema/laboratorio');
  await expect(page.getByRole('heading', { name: 'Laboratorio' })).toBeVisible();

  /* La entregada no está entre las pendientes; está en la otra pestaña. */
  await expect(page.locator('.cola, .vacio')).not.toContainText(NOMBRE);
  await page.goto('/sistema/laboratorio?ver=entregadas');
  await expect(page.locator('.cola')).toContainText(NOMBRE);
});

/* ------------------------------------------------------------------
   Lo que el médico pidió sí vuelve a su consulta.
   ------------------------------------------------------------------ */

test('la atención general sigue teniendo su formulario completo', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA_GENERAL)}&tipo=general`);

  expect(await page.locator('[data-ir]').count()).toBeGreaterThan(5);
  await expect(page.locator('#c-idx')).toHaveCount(1);       // el diagnóstico
});

test('los exámenes pedidos en una consulta quedan colgados de ella', async ({ page }) => {
  await entrar(page, 'medico');

  // Una consulta, guardada como borrador.
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA_PEDIDOS)}&tipo=general`);
  await page.locator('#c-nombre').fill('Pedido Desde Consulta de Prueba');
  await page.getByRole('button', { name: 'Guardar y salir' }).click();
  await expect(page).toHaveURL(FICHA);
  const consulta = idDeLaFicha(page.url());

  // Desde la consulta, "Pedir exámenes".
  await page.getByRole('link', { name: 'Pedir exámenes' }).click();
  await expect(page.locator('input[name="tipo_atencion"]')).toHaveValue('laboratorio');
  await expect(page.locator('input[name="origen"]')).toHaveValue(consulta);

  await page.locator('[data-ir="1"]').click();
  await page.locator('input[name="examen"]').first().check();
  await page.getByRole('button', { name: 'Guardar la orden' }).click();
  await expect(page).toHaveURL(FICHA);

  const [orden] = await conBase((sql) => sql`
    SELECT id, origen_id FROM atencion
     WHERE tipo = 'laboratorio' AND origen_id = ${consulta}`);
  expect(orden?.origen_id).toBe(consulta);

  /* Y desde la consulta se ve la orden: es la respuesta a lo que el cliente
     dejó abierto, «¿se queda aparte o se anexa a la historia médica?». */
  await page.goto(`/sistema/atencion/${consulta}`);
  await expect(page.locator('.col__lado')).toContainText('Laboratorio');
  await expect(page.locator('.col__lado')).toContainText('Esperando resultados');

  // Y desde la orden se vuelve a la consulta.
  await page.goto(`/sistema/atencion/${orden.id}`);
  await expect(page.locator('.col__lado')).toContainText('De qué consulta salió');
});

/* ------------------------------------------------------------------
   El papel y el Excel.
   ------------------------------------------------------------------ */

test('el informe impreso lleva los valores, su referencia y el renglón del bioanalista', async ({ page }) => {
  const [orden] = await conBase((sql) => sql`
    SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${CEDULA.replace(/\D/g, '')} AND a.tipo = 'laboratorio'`);

  await entrar(page, 'bioanalista');
  await page.goto(`/sistema/atencion/${orden.id}/documento`);

  await expect(page.locator('.enc__titulo')).toContainText('Informe de laboratorio');
  // Nada de récipe ni de examen físico en una hoja de laboratorio.
  await expect(page.locator('.hoja--recipe')).toHaveCount(0);

  const tabla = page.locator('.valores');
  await expect(tabla).toContainText('Hemoglobina');
  await expect(tabla).toContainText('13,4');
  await expect(tabla).toContainText('12,0 - 16,0');

  /* El sello va húmedo: el cliente dijo que lo estampa a mano sobre el
     papel. La hoja deja el renglón y no dibuja ninguna imagen de sello. */
  await expect(page.locator('.firma__linea em')).toContainText('sello y firma');
});

test('el Excel de los resultados se descarga', async ({ page }) => {
  const [orden] = await conBase((sql) => sql`
    SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${CEDULA.replace(/\D/g, '')} AND a.tipo = 'laboratorio'`);

  await entrar(page, 'bioanalista');
  const r = await page.request.get(`/sistema/atencion/${orden.id}/resultados.xlsx`);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('spreadsheetml');
  expect(r.headers()['content-disposition']).toContain('.xlsx');
  // Un xlsx es un zip: empieza por PK.
  expect((await r.body()).subarray(0, 2).toString()).toBe('PK');
});

test('el Excel no existe para una consulta', async ({ page }) => {
  await entrar(page, 'medico');
  const [consulta] = await conBase((sql) => sql`
    SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${CEDULA_PEDIDOS.replace(/\D/g, '')} AND a.tipo = 'general'`);
  const r = await page.request.get(`/sistema/atencion/${consulta.id}/resultados.xlsx`);
  expect(r.status()).toBe(404);
});
