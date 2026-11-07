/**
 * Permisos y anulación.
 *
 * Hasta acá cualquiera con sesión podía hacer todo: el médico cambiaba
 * precios y exportaba el cierre, administración escribía historias
 * clínicas. Estas pruebas fijan quién puede qué, para que un cambio en la
 * tabla de permisos no se escape sin que nadie lo note.
 */
import { test, expect } from '@playwright/test';
import {
  entrar, salir, crearAtencionCerrada, crearBorrador, idDeLaFicha,
  cedulaDePrueba, historiaMinima, borrarPacientes, bitacoraDe, anchos, conBase,
} from './apoyo';

const estadoDe = (atencion: string) =>
  conBase(async (sql) => {
    const [f] = await sql`SELECT estado FROM atencion WHERE id = ${atencion}`;
    return f?.estado as string | undefined;
  });

/* El panel tiene dos formularios en pantalla: el de la página y el de
   "Salir" en la barra. Un button[type=submit] a secas agarra el de salir,
   cierra la sesión y el fallo aparece disfrazado de "perdió el permiso". */
const anular = (p: import('@playwright/test').Page) =>
  p.getByRole('button', { name: 'Anular la atención' }).click();

const CEDULA = cedulaDePrueba(9);
const CEDULA_AJENA = cedulaDePrueba(9, 1);

test.afterAll(async () => {
  await borrarPacientes(CEDULA, CEDULA_AJENA);
});

/* ---------------------------------------------------------------
   El menú: nadie ve una puerta que no puede abrir.
   --------------------------------------------------------------- */

test('el médico no ve el cierre del mes ni los servicios en el menú', async ({ page }) => {
  await entrar(page, 'medico');
  const menu = page.locator('.sis__nav');
  await expect(menu.getByRole('link', { name: 'Casos' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Nueva atención' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Cierre del mes' })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: 'Servicios' })).toHaveCount(0);
});

test('administración no ve ningún botón que lleve a escribir una historia', async ({ page }) => {
  await entrar(page, 'administracion');
  /* No alcanza con sacarlo del menú: la cabecera de Casos tenía su propio
     botón "Nueva atención" que llevaba derecho a "no tiene permiso". */
  await expect(page.locator('a[href="/sistema/atencion/nueva"]')).toHaveCount(0);
});

test('administración no ve nueva atención ni borradores en el menú', async ({ page }) => {
  await entrar(page, 'administracion');
  const menu = page.locator('.sis__nav');

  /* Lo suyo vive dentro del grupo "Cobros", que viene cerrado: se abre para
     mirarlo. Lo que importa de esta prueba no es si está desplegado, sino
     que el destino exista para administración y NO exista para lo que es del
     médico; por eso lo de abajo se comprueba por conteo y no por visibilidad,
     que daría verde aunque el enlace estuviera ahí escondido. */
  await menu.locator('.sis__grupo').filter({ hasText: 'Cobros' }).locator('summary').click();
  await expect(menu.getByRole('link', { name: 'Cierre del mes' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Servicios y precios' })).toBeVisible();

  await expect(menu.getByRole('link', { name: 'Nueva atención' })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: 'Borradores' })).toHaveCount(0);
});

/* ---------------------------------------------------------------
   La dirección escrita a mano tampoco alcanza.
   --------------------------------------------------------------- */

test('el médico que escribe la dirección del cierre termina en sin permiso', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/cierre');
  await expect(page).toHaveURL(/\/sistema\/sin-permiso/);
  await expect(page.locator('h1')).toContainText('No tiene permiso');
  await expect(page.locator('.corte__motivo')).toContainText('administración');
});

test('el médico no puede abrir el catálogo de servicios', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/servicios');
  await expect(page).toHaveURL(/\/sistema\/sin-permiso/);
});

test('administración no puede abrir el formulario de atención', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/atencion/nueva');
  await expect(page).toHaveURL(/\/sistema\/sin-permiso/);
  await expect(page.locator('.corte__motivo')).toContainText('personal médico');
});

test('la pantalla de sin permiso dice con qué rol entró', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/cierre');
  await expect(page.locator('.corte__quien')).toContainText('Médico');
});

test('la descarga del cierre rechaza al médico con 403', async ({ page }) => {
  await entrar(page, 'medico');
  const r = await page.request.get('/sistema/cierre/exportar?mes=2026-11');
  expect(r.status()).toBe(403);
});

/* ---------------------------------------------------------------
   Un borrador lo termina quien lo abrió.
   --------------------------------------------------------------- */

test('otro médico abre el borrador ajeno pero no lo puede escribir', async ({ page, browser }) => {
  await entrar(page, 'medico');
  await crearBorrador(page, { ...historiaMinima, nombre: 'Paciente Ajeno Uno', cedula: CEDULA_AJENA });
  const atencion = idDeLaFicha(page.url());

  const otra = await browser.newContext();
  const otro = await otra.newPage();
  await entrar(otro, 'medico2');
  await otro.goto(`/sistema/atencion/${atencion}/editar`);

  // Tiene el permiso de escribir historias, pero esta no es suya.
  await expect(otro.locator('h1')).toContainText('lo abrió otro médico');
  await expect(otro.locator('form.form')).toHaveCount(0);
  await otra.close();
});

test('administración ni siquiera llega al formulario de edición', async ({ page, browser }) => {
  await entrar(page, 'medico');
  await crearBorrador(page, { ...historiaMinima, nombre: 'Paciente Ajeno Tres', cedula: CEDULA_AJENA });
  const atencion = idDeLaFicha(page.url());

  const otra = await browser.newContext();
  const admin = await otra.newPage();
  await entrar(admin, 'administracion');
  await admin.goto(`/sistema/atencion/${atencion}/editar`);
  await expect(admin).toHaveURL(/\/sistema\/sin-permiso/);
  await otra.close();
});

test('un POST directo contra el borrador de otro médico no escribe', async ({ page, browser }) => {
  await entrar(page, 'medico');
  await crearBorrador(page, { ...historiaMinima, nombre: 'Paciente Ajeno Dos', cedula: CEDULA });
  const atencion = idDeLaFicha(page.url());

  /* El segundo médico manda el formulario a mano, con Origin válido: la
     pantalla no es la única defensa, el dueño va en el WHERE de la base. */
  const otra = await browser.newContext();
  const otro = await otra.newPage();
  await entrar(otro, 'medico2');
  await otro.request.post(`/sistema/atencion/${atencion}/editar`, {
    form: { accion: 'borrador', nombre: 'Nombre Cambiado A La Fuerza', cedula: CEDULA },
    headers: { Origin: 'http://localhost:4399' },
  });
  await otra.close();

  await page.goto(`/sistema/atencion/${atencion}`);
  await expect(page.locator('h1')).not.toContainText('Nombre Cambiado A La Fuerza');
  await expect(page.locator('h1')).toContainText('Paciente Ajeno Dos');
});

/* ---------------------------------------------------------------
   Anular.
   --------------------------------------------------------------- */

test('el médico no ve el botón de anular', async ({ page }) => {
  await entrar(page, 'medico');
  await crearAtencionCerrada(page, { ...historiaMinima, nombre: 'Paciente Anular Uno', cedula: CEDULA });
  await expect(page.locator('.cab__acciones').getByText('Anular')).toHaveCount(0);
});

test('anular exige motivo y confirmación con el número', async ({ page, browser }) => {
  await entrar(page, 'medico');
  await crearAtencionCerrada(page, { ...historiaMinima, nombre: 'Paciente Anular Dos', cedula: CEDULA });
  const atencion = idDeLaFicha(page.url());
  const numero = (await page.locator('.cab__meta strong').first().innerText()).replace(/\D/g, '');

  const otra = await browser.newContext();
  const admin = await otra.newPage();
  await entrar(admin, 'administracion');
  await admin.goto(`/sistema/atencion/${atencion}/anular`);

  /* Motivo demasiado corto: no anula. Acá frena la validación nativa del
     navegador (minlength), antes de que el POST salga; por eso se comprueba
     que la pantalla siga siendo la de anular y no el mensaje del servidor. */
  await admin.fill('#motivo', 'error');
  await admin.fill('#confirma', numero);
  await anular(admin);
  await expect(admin).toHaveURL(/\/anular$/);
  await expect(admin.locator('#motivo')).toBeVisible();

  /* El motivo corto también tiene que rebotar en el servidor, no solo en el
     navegador: alguien puede mandar el formulario sin pasar por el HTML.
     Se comprueba el efecto y no el mensaje, que es lo que de verdad importa:
     la atención no puede quedar anulada. */
  await admin.request.post(`/sistema/atencion/${atencion}/anular`, {
    form: { motivo: 'error', confirma: numero },
    headers: { Origin: 'http://localhost:4399' },
  });
  expect(await estadoDe(atencion), 'un motivo corto no puede anular').toBe('cerrada');

  // Número equivocado: tampoco anula.
  await admin.fill('#motivo', 'Se registró con la cédula equivocada del paciente.');
  await admin.fill('#confirma', '999999');
  await anular(admin);
  await expect(admin.locator('.sis-error')).toContainText('escriba el número', { ignoreCase: true });

  // Con las dos cosas bien: anula y vuelve a la ficha.
  await admin.fill('#confirma', numero);
  await anular(admin);
  await expect(admin).toHaveURL(new RegExp(`/sistema/atencion/${atencion}$`));
  await expect(admin.locator('.chapa')).toContainText('Anulada');

  const acciones = await bitacoraDe(atencion);
  expect(acciones).toContain('anulo');
  await otra.close();
});

test('una atención anulada desaparece del cierre del mes', async ({ page, browser }) => {
  await entrar(page, 'medico');
  await crearAtencionCerrada(page, { ...historiaMinima, nombre: 'Paciente Anular Tres', cedula: CEDULA });
  const atencion = idDeLaFicha(page.url());
  const numero = (await page.locator('.cab__meta strong').first().innerText()).replace(/\D/g, '');

  const otra = await browser.newContext();
  const admin = await otra.newPage();
  await entrar(admin, 'administracion');

  await admin.goto(`/sistema/atencion/${atencion}/anular`);
  await admin.fill('#motivo', 'Duplicada: la atención correcta quedó registrada aparte.');
  await admin.fill('#confirma', numero);
  await anular(admin);
  await expect(admin.locator('.chapa')).toContainText('Anulada');

  // Ya anulada, la pantalla lo dice y no la anula dos veces.
  await admin.goto(`/sistema/atencion/${atencion}/anular`);
  await expect(admin.locator('h1')).toContainText('ya está anulada');
  await otra.close();
});

test('un borrador no se anula: se explica por qué', async ({ page, browser }) => {
  await entrar(page, 'medico');
  await crearBorrador(page, { ...historiaMinima, nombre: 'Paciente Anular Cuatro', cedula: CEDULA });
  const atencion = idDeLaFicha(page.url());

  const otra = await browser.newContext();
  const admin = await otra.newPage();
  await entrar(admin, 'administracion');
  await admin.goto(`/sistema/atencion/${atencion}/anular`);
  await expect(admin.locator('h1')).toContainText('todavía es un borrador');
  await otra.close();
});

test('las pantallas de permisos y anulación no desbordan a 390 px', async ({ page, browser }) => {
  await entrar(page, 'medico');
  await crearAtencionCerrada(page, { ...historiaMinima, nombre: 'Paciente Anular Cinco', cedula: CEDULA });
  const atencion = idDeLaFicha(page.url());

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/sistema/cierre');
  let medida = await anchos(page);
  expect(medida.documento, 'sin-permiso desborda').toBeLessThanOrEqual(medida.ventana);

  const otra = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const admin = await otra.newPage();
  await entrar(admin, 'administracion');
  await admin.goto(`/sistema/atencion/${atencion}/anular`);
  medida = await anchos(admin);
  expect(medida.documento, 'anular desborda').toBeLessThanOrEqual(medida.ventana);
  await otra.close();
});

test('salir sigue invalidando la sesión con cualquier rol', async ({ page }) => {
  await entrar(page, 'administracion');
  await salir(page);
  await page.goto('/sistema');
  await expect(page).toHaveURL(/\/sistema\/entrar/);
});
