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
const CEDULA_PLANTILLA = cedulaDePrueba(13, 3);
const NOMBRE = 'Carmen Rosa Laboratorio de Prueba';

const EXAMEN_A = 'Hematología completa de prueba';
const EXAMEN_B = 'Glicemia de prueba';

const limpiar = () =>
  conBase(async (sql) => {
    for (const c of [CEDULA, CEDULA_GENERAL, CEDULA_PEDIDOS, CEDULA_PLANTILLA]) {
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

test('al médico, después de la cédula, se le abre la historia y nada más', async ({ page }) => {
  /* Antes había un paso en el medio con dos botones. Dejó de tener sentido
     cuando el cliente separó los oficios: «¿por qué el médico puede pedir o
     poner laboratorio? Por eso hay un bioanalista». Con una sola respuesta
     posible, la pregunta era un toque de más. */
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}`);

  await expect(page.getByRole('heading', { name: '¿Qué se le va a hacer?' })).toHaveCount(0);
  await expect(page.locator('#c-nombre')).toBeVisible();
  await expect(page.locator('input[name="tipo_atencion"]')).toHaveValue('general');
});

test('el médico no puede abrir una orden de laboratorio ni pedirla', async ({ page }) => {
  await entrar(page, 'medico');
  /* Ni forzando el parámetro: lo que manda es el permiso. */
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}&tipo=laboratorio`);
  await expect(page.locator('input[name="tipo_atencion"]')).toHaveValue('general');
  await expect(page.locator('#c-idx')).toHaveCount(1);        // es la historia completa
});

test('a recepción se le abre la orden, y nunca la historia', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}`);
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
  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}`);

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
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA_GENERAL)}`);

  expect(await page.locator('[data-ir]').count()).toBeGreaterThan(5);
  await expect(page.locator('#c-idx')).toHaveCount(1);       // el diagnóstico
});

test('el médico abre la consulta y no ve el botón de pedir exámenes', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA_PEDIDOS)}&tipo=general`);
  await page.locator('#c-nombre').fill('Pedido Desde Consulta de Prueba');
  await page.getByRole('button', { name: 'Guardar y salir' }).click();
  await expect(page).toHaveURL(FICHA);
  await expect(page.getByRole('link', { name: 'Pedir exámenes' })).toHaveCount(0);
});

test('los exámenes pedidos en una consulta quedan colgados de ella', async ({ page }) => {
  /* Lo abre recepción desde la consulta del médico: él indica los exámenes
     escribiéndolos en su historia, y quien registra la orden es recepción.
     Era la duda que el cliente dejó abierta —«¿se queda aparte o se anexa a
     la historia médica?»— y se anexa. */
  await entrar(page, 'recepcionista');
  const [previa] = await conBase((sql) => sql`
    SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${CEDULA_PEDIDOS.replace(/\D/g, '')} AND a.tipo = 'general'`);
  const consulta = previa.id as string;

  await page.goto(`/sistema/atencion/${consulta}`);
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

/* ------------------------------------------------------------------
   Las plantillas del archivo del cliente.
   ------------------------------------------------------------------ */

test('se registra una orden para cargarle una plantilla', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA_PLANTILLA)}&tipo=laboratorio`);
  await page.locator('#c-nombre').fill('Plantilla de Prueba Mendoza');
  await page.locator('#c-edad').fill('50');
  await page.locator('#c-sexo').selectOption('Masculino');
  await page.getByRole('button', { name: 'Guardar la orden' }).click();
  await expect(page).toHaveURL(FICHA);
});

test('las plantillas entraron, y los rangos que entraron son los de su hoja', async () => {
  const [n] = await conBase((sql) => sql`
    SELECT COUNT(DISTINCT examen)::int AS examenes, COUNT(*)::int AS analitos,
           COUNT(*) FILTER (WHERE referencia <> '')::int AS con_rango
      FROM plantilla_examen`);
  expect(n.examenes).toBe(35);
  expect(n.analitos).toBe(188);
  /* 92 vienen en blanco a propósito: su hoja no los decía en una columna
     rotulada y deducirlos ponía el rango de un examen al lado del
     resultado de otro. Ver 013-plantillas.sql. */
  expect(n.con_rango).toBe(96);

  /* Cinco que se verificaron a mano contra el archivo. Si una carga futura
     los mueve, esta prueba lo dice antes de que salga impreso. */
  const filas = await conBase((sql) => sql`
    SELECT examen, analito, unidad, referencia FROM plantilla_examen
     WHERE (examen = 'QUIMICA RUTINA' AND analito IN ('GLICEMIA', 'ACIDO URICO'))
        OR (examen = 'PERFIL LIPIDICO' AND analito = 'HDL-COLESTEROL')
        OR (examen = 'TRANS-BIL-PROT' AND analito = 'ALBUMINA')
        OR (examen = 'ESPECIAL DE GLICEMIA' AND analito = 'HEMOGLOBINA GLICADA (HbA1c)')
     ORDER BY examen, analito`);

  expect(filas.map((f) => `${f.analito} · ${f.unidad} · ${f.referencia}`)).toEqual([
    'HEMOGLOBINA GLICADA (HbA1c) · % · 4,0-6,3',
    'HDL-COLESTEROL · mg/dl · > 40',
    'ACIDO URICO · mg/dl · HOMBRES: 2,5 - 6,2 / MUJERES: 3,7 - 7,7',
    'GLICEMIA · mg/dl · 70 - 99',
    'ALBUMINA · g/dl · 3,5 - 4,8',
  ]);

  /* Orina y heces NO están, y es a propósito: son formularios de dos
     mitades y leerlos por columna emparejaba el aspecto macroscópico con el
     rango de los leucocitos del microscópico. */
  const fuera = await conBase((sql) => sql`
    SELECT 1 FROM plantilla_examen WHERE examen IN ('ORINA', 'HECES')`);
  expect(fuera.length).toBe(0);
});

test('poner una plantilla llena los renglones, y ponerla dos veces no los duplica', async ({ page }) => {
  const [orden] = await conBase((sql) => sql`
    SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
     WHERE p.cedula_busca = ${CEDULA_PLANTILLA.replace(/\D/g, '')} AND a.tipo = 'laboratorio'`);

  await entrar(page, 'bioanalista');
  await page.goto(`/sistema/atencion/${orden.id}/resultados`);

  await page.locator('#res-plantilla').selectOption('PERFIL LIPIDICO');
  await page.getByRole('button', { name: 'Poner' }).click();

  // Cinco analitos, con su unidad y su rango ya escritos.
  await expect(page.locator('#res-cuerpo tr')).toHaveCount(5);

  /* Se leen los tres campos de cada fila de una vez. Localizar por el texto
     no sirve —lo que dice «HDL-COLESTEROL» es el value de un input, no
     contenido de texto— y por [value=] tampoco: eso mira el ATRIBUTO del
     HTML y el script escribe la propiedad. */
  const renglones = () =>
    page.locator('#res-cuerpo tr').evaluateAll((filas) =>
      filas.map((f) => {
        const dame = (n: string) => (f.querySelector(`input[name="${n}"]`) as HTMLInputElement)?.value ?? '';
        return [dame('examen'), dame('unidad'), dame('referencia')].join(' · ');
      }),
    );

  expect(await renglones()).toContain('HDL-COLESTEROL · mg/dl · > 40');

  // Otra vez la misma: no se duplica nada.
  await page.locator('#res-plantilla').selectOption('PERFIL LIPIDICO');
  await page.getByRole('button', { name: 'Poner' }).click();
  await expect(page.locator('#res-cuerpo tr')).toHaveCount(5);

  /* Y una que comparte analitos con la anterior solo agrega los que
     faltan: química rutina trae colesterol y triglicéridos, que ya están. */
  await page.locator('#res-plantilla').selectOption('QUIMICA RUTINA');
  await page.getByRole('button', { name: 'Poner' }).click();
  const nombres = await page.locator('#res-cuerpo input[name="examen"]').evaluateAll(
    (is) => is.map((i) => (i as HTMLInputElement).value),
  );
  expect(new Set(nombres).size).toBe(nombres.length);
  expect(nombres).toContain('GLICEMIA');

  // Lo cargado se guarda con su referencia.
  const filaHdl = page.locator('#res-cuerpo tr').nth(
    (await renglones()).findIndex((t) => t.startsWith('HDL-COLESTEROL')),
  );
  await filaHdl.locator('input[name="valor"]').fill('55');
  await page.getByRole('button', { name: 'Guardar y seguir después' }).click();
  await expect(page.locator('.form__aviso--bien')).toBeVisible();

  const [guardada] = await conBase((sql) => sql`
    SELECT resultados FROM atencion WHERE id = ${orden.id}`);
  const hdl = (guardada.resultados as { examen: string; valor: string; referencia: string }[])
    .find((r) => r.examen === 'HDL-COLESTEROL');
  expect(hdl).toMatchObject({ valor: '55', unidad: 'mg/dl', referencia: '> 40' });
});
