/**
 * El cierre del mes: qué se hizo y qué hay que cobrarle a cada quien.
 *
 * El agrupamiento es por renglón y no por atención, que es la parte que se
 * puede entender mal: una atención que el seguro cubre a medias sale en dos
 * grupos, y en cada uno solo con sus propias líneas. También se vigila que
 * una atención anulada quede fuera —sin borrarla— y que la planilla baje
 * como Excel de verdad.
 *
 * Los datos son propios y se borran al final, incluido el 'exporto' que la
 * descarga deja en bitácora.
 */
import { test, expect } from '@playwright/test';
import {
  CORRIDA, ahoraEnLaBase, anularEnLaBase, borrarExportos, borrarPacientes, cargarAMano,
  cedulaDePrueba, claveDeCobrador, crearAtencionCerrada, dolaresDe, entrar, mesDeLaAtencion,
  numeroDelCaso,
} from './apoyo';

test.describe.configure({ mode: 'serial' });

const CEDULA_MIXTO = cedulaDePrueba(4, 0);
const CEDULA_DIRECTO = cedulaDePrueba(4, 1);
const CEDULA_ANULADO = cedulaDePrueba(4, 2);

const SEGURO = `Seguros Prueba ${CORRIDA}`;
const SEGURO_ANULADO = `Seguros Anulados ${CORRIDA}`;
const CLAVE_SEGURO = claveDeCobrador(SEGURO);

const CONSULTA = 'Consulta cubierta de prueba';
const INSUMO = 'Insumo aparte de prueba';
const CURACION = 'Curación directa de prueba';
const PERDIDO = 'Renglón de atención anulada de prueba';

/** Como nombra la pantalla a lo que el paciente paga de su bolsillo. */
const PACIENTES = 'Pacientes directos';

const NOMBRE_MIXTO = 'Carmen Rosa Delgado de Prueba';
const NOMBRE_DIRECTO = 'Rafael Antonio Suárez de Prueba';

let mixto = '';
let numeroMixto = '';
let directo = '';
let mes = '';
/** La hora de la base cuando arrancó, para poder borrar el 'exporto'. */
let desde: Date;

test.beforeAll(async ({ browser }) => {
  desde = await ahoraEnLaBase();

  const page = await browser.newPage();
  /* Las historias las escribe el médico: administración no firma
     diagnósticos. Las pruebas de abajo sí entran como administración,
     porque el cierre del mes es suyo. */
  await entrar(page, 'medico');

  /* Un caso repartido: la consulta la cubre el seguro y el insumo que el
     médico agregó encima lo paga el paciente. Es la sal del adobo. */
  mixto = await crearAtencionCerrada(page, {
    nombre: NOMBRE_MIXTO,
    cedula: CEDULA_MIXTO,
    aseguradora: SEGURO,
    poliza: `POL-${CORRIDA}`,
  });
  numeroMixto = await numeroDelCaso(page);
  await cargarAMano(page, mixto, { descripcion: CONSULTA, precio: '40,00', paga: 'aseguradora' });
  await cargarAMano(page, mixto, { descripcion: INSUMO, cantidad: '2', precio: '7,50', paga: 'paciente' });

  // Un caso que paga el paciente completo.
  directo = await crearAtencionCerrada(page, {
    nombre: NOMBRE_DIRECTO,
    cedula: CEDULA_DIRECTO,
  });
  await cargarAMano(page, directo, { descripcion: CURACION, precio: '25,00', paga: 'paciente' });

  /* Y una que se cerró, se cobró y después se anuló. Queda en la base con
     su motivo, pero no se le cobra a nadie. */
  const anulado = await crearAtencionCerrada(page, {
    nombre: 'Gladys Marina Peña de Prueba',
    cedula: CEDULA_ANULADO,
    aseguradora: SEGURO_ANULADO,
  });
  await cargarAMano(page, anulado, { descripcion: PERDIDO, precio: '99,00', paga: 'aseguradora' });
  await anularEnLaBase(anulado, 'Se cargó al paciente equivocado');

  mes = await mesDeLaAtencion(mixto);
  await page.close();
});

test.afterAll(async () => {
  await borrarPacientes(CEDULA_MIXTO, CEDULA_DIRECTO, CEDULA_ANULADO);
  await borrarExportos(desde);
});

test('el consolidado del mes agrupa por quién cobra y los totales cuadran', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/cierre?mes=${mes}`);

  const delSeguro = page.locator('table.resumen tbody tr', { hasText: SEGURO });
  await expect(delSeguro.locator('td').nth(0), 'casos del seguro').toHaveText('1');
  await expect(delSeguro.locator('td').nth(1), 'renglones del seguro').toHaveText('1');
  await expect(delSeguro.locator('td').nth(2)).toContainText('40,00 USD');

  // Los pacientes directos pagaron el insumo de un caso y la curación del otro.
  const directos = page.locator('table.resumen tbody tr', { hasText: PACIENTES });
  await expect(directos).toBeVisible();

  /* El total del mes es la suma de las filas de arriba, moneda por moneda.
     Se compara contra lo que la propia tabla muestra en vez de contra una
     cifra escrita acá: en el mes puede haber trabajo de otras pruebas o del
     día, y lo que se está verificando es que la cuenta cierre. */
  const filas = page.locator('table.resumen tbody tr');
  let suma = 0;
  for (let i = 0; i < (await filas.count()); i++) {
    suma += await dolaresDe(filas.nth(i).locator('td').nth(2));
  }
  const totalDelMes = await dolaresDe(page.locator('table.resumen tfoot tr td').nth(2));

  expect(Math.round(suma * 100) / 100).toBe(totalDelMes);
  // Y lo nuestro está adentro: 40,00 + 15,00 + 25,00.
  expect(totalDelMes).toBeGreaterThanOrEqual(80);
});

test('la atención repartida sale en dos grupos, cada uno con sus líneas', async ({ page }) => {
  await entrar(page, 'administracion');

  // Vista del seguro: solo la consulta que él cubre.
  await page.goto(`/sistema/cierre?mes=${mes}&cobrar_a=${CLAVE_SEGURO}`);
  const grupoSeguro = page.locator('section.grupo', {
    has: page.getByRole('heading', { name: SEGURO }),
  });
  const casoEnSeguro = grupoSeguro.locator('li.caso', { hasText: NOMBRE_MIXTO });
  await expect(casoEnSeguro.locator('ul.lineas li')).toHaveCount(1);
  await expect(casoEnSeguro).toContainText(`N° ${numeroMixto}`);
  await expect(casoEnSeguro).toContainText(CONSULTA);
  await expect(casoEnSeguro).not.toContainText(INSUMO);
  await expect(casoEnSeguro.locator('.caso__total')).toContainText('40,00 USD');
  // Un solo grupo en pantalla cuando se pide uno.
  await expect(page.locator('section.grupo')).toHaveCount(1);

  // Vista de los pacientes: del mismo caso, solo el insumo.
  await page.goto(`/sistema/cierre?mes=${mes}&cobrar_a=${claveDeCobrador(PACIENTES)}`);
  const grupoPacientes = page.locator('section.grupo', {
    has: page.getByRole('heading', { name: PACIENTES }),
  });
  const casoEnPacientes = grupoPacientes.locator('li.caso', { hasText: NOMBRE_MIXTO });
  await expect(casoEnPacientes).toContainText(INSUMO);
  await expect(casoEnPacientes).not.toContainText(CONSULTA);
  await expect(casoEnPacientes.locator('.caso__total')).toContainText('15,00 USD');

  // Y el caso que paga el paciente completo también está acá.
  await expect(grupoPacientes.locator('li.caso', { hasText: NOMBRE_DIRECTO }))
    .toContainText(CURACION);

  // La pantalla avisa que un caso repartido se cuenta en los dos grupos.
  await expect(page.getByText('entre más de un pagador')).toBeVisible();
});

test('una atención anulada no entra en el cierre', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/cierre?mes=${mes}`);

  // Ni el seguro que la cubría ni el renglón que tenía cargado.
  await expect(page.getByText(SEGURO_ANULADO)).toHaveCount(0);
  await expect(page.getByText(PERDIDO)).toHaveCount(0);

  // Tampoco se puede pedir su planilla.
  const descarga = await page.request.get(
    `/sistema/cierre/exportar?mes=${mes}&cobrar_a=${claveDeCobrador(SEGURO_ANULADO)}`,
  );
  expect(descarga.status()).toBe(404);
});

test('la descarga del mes responde con el Content-Type de xlsx', async ({ page }) => {
  await entrar(page, 'administracion');

  const descarga = await page.request.get(
    `/sistema/cierre/exportar?mes=${mes}&cobrar_a=${CLAVE_SEGURO}`,
  );

  expect(descarga.status()).toBe(200);
  expect(descarga.headers()['content-type']).toContain(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  expect(descarga.headers()['content-disposition']).toContain(
    `filename="atenmefa-${mes}-${CLAVE_SEGURO}.xlsx"`,
  );

  /* Un .xlsx es un zip: si el archivo no arranca con PK el navegador lo
     bajaría igual y Excel diría que está dañado. */
  const archivo = await descarga.body();
  expect(archivo.subarray(0, 2).toString('latin1')).toBe('PK');
  expect(archivo.byteLength).toBeGreaterThan(1000);
});
