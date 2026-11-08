/**
 * Registro general de pacientes: encontrar a la persona y leer su ficha.
 *
 * Lo que se prueba no es que la tabla se dibuje. Son cuatro cosas que, si
 * fallan, hacen daño de verdad:
 *
 *   · que la cédula se encuentre como sea que esté escrita, porque en
 *     recepción nadie la teclea dos veces igual;
 *   · que la ficha muestre TODAS las atenciones, incluidas las anuladas y
 *     marcadas como tales: una atención que desaparece de la vista es lo
 *     primero que pregunta una auditoría;
 *   · que lo facturado sea la suma de los renglones que cuentan y nada más;
 *   · que las alergias que se ven sean las de la última atención que las
 *     escribió, que es la única línea de esta pantalla que un médico lee
 *     antes de tocar al paciente.
 *
 * El paciente se arma por pantalla y no por la base: lo que se mide es el
 * camino completo, desde el formulario de la atención hasta la ficha.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  entrar, crearAtencionCerrada, numeroDelCaso, cargarAMano, anularEnLaBase,
  cedulaDePrueba, historiaMinima, soloDigitos, montoDeTexto, anchos,
  pacienteEnLaBase, renglonesSumadosDe, bitacoraDePaciente,
  borrarBitacoraDePacientes, borrarPacientes, conBase,
} from './apoyo';

const CEDULA = cedulaDePrueba(8, 0);
const OTRA = cedulaDePrueba(8, 1);

/* Un apellido que no existe y que ninguna otra prueba usa: así buscar por
   nombre no se cruza con los pacientes que inventan los demás archivos. */
const APELLIDO = 'Quintuña';
const NOMBRE = `Griselda Paulina ${APELLIDO} de Prueba`;
const OTRO_NOMBRE = 'Tomás Elías Berroterán de Prueba';

const ALERGIA = 'Penicilina y yodo de prueba';
const MOTIVO = 'Cargada dos veces por error de prueba';

let paciente = '';
let cedulaGuardada = '';
let otroPaciente = '';
/** Los N° de caso, que es como la ficha nombra cada atención. */
let primera = '';
let ultima = '';
let anulada = '';

/** El recuadro del resumen que lleva ese rótulo. */
const recuadro = (page: Page, rotulo: string) =>
  page.locator('.cifras li')
    .filter({ has: page.locator('.cifras__rotulo', { hasText: new RegExp(`^${rotulo}$`) }) });

/** La fila del historial de una atención, por su N° de caso. */
const filaDelCaso = (page: Page, numero: string) =>
  page.locator('.historial tbody tr', { hasText: new RegExp(`N°\\s*${numero}\\b`) });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await entrar(page, 'medico');

  /* Tres atenciones de la misma persona, en este orden a propósito: el
     formulario precarga los antecedentes de la visita anterior, así que la
     alergia que tiene que terminar en la ficha es la de la segunda, y la
     tercera —que se anula— no puede taparla. */
  const caso1 = await crearAtencionCerrada(page, {
    ...historiaMinima,
    nombre: NOMBRE,
    cedula: CEDULA,
    telefono: '0414-8930000',
    alergias: 'Ninguna',
    idx: 'Faringitis de prueba',
    aseguradora: 'Seguros del Registro',
  });
  primera = await numeroDelCaso(page);
  await cargarAMano(page, caso1, {
    descripcion: 'Consulta del registro', cantidad: '1', precio: '50,00',
    moneda: 'USD', paga: 'paciente',
  });

  const caso2 = await crearAtencionCerrada(page, {
    ...historiaMinima,
    nombre: NOMBRE,
    cedula: CEDULA,
    alergias: ALERGIA,
    idx: 'Cefalea de prueba',
  });
  ultima = await numeroDelCaso(page);
  await cargarAMano(page, caso2, {
    descripcion: 'Insumo del registro', cantidad: '2', precio: '15,00',
    moneda: 'USD', paga: 'paciente',
  });

  /* La anulada lleva renglones cargados ANTES de anularse, y por un monto
     que no se parece a ningún otro: si algún día volviera a sumar, el
     recuadro de la ficha lo grita. */
  const caso3 = await crearAtencionCerrada(page, {
    ...historiaMinima,
    nombre: NOMBRE,
    cedula: CEDULA,
    idx: 'Control de prueba',
  });
  anulada = await numeroDelCaso(page);
  await cargarAMano(page, caso3, {
    descripcion: 'Renglón anulado de prueba', cantidad: '1', precio: '999,00',
    moneda: 'USD', paga: 'paciente',
  });
  await anularEnLaBase(caso3, MOTIVO);

  // Una segunda persona: sin ella, buscar no tiene nada que descartar.
  await crearAtencionCerrada(page, {
    ...historiaMinima, nombre: OTRO_NOMBRE, cedula: OTRA, idx: 'Lumbalgia de prueba',
  });

  const ficha = await pacienteEnLaBase(CEDULA);
  paciente = ficha.id;
  cedulaGuardada = ficha.cedula;
  otroPaciente = (await pacienteEnLaBase(OTRA)).id;

  await page.close();
});

test.afterAll(async () => {
  // La bitácora de la ficha primero: apunta al paciente, no a la atención.
  await borrarBitacoraDePacientes(CEDULA, OTRA);
  await borrarPacientes(CEDULA, OTRA);
});

test('el buscador encuentra por nombre y por cédula escrita de cualquier forma', async ({ page }) => {
  await entrar(page, 'administracion');

  const buscados = [
    cedulaGuardada,                       // V-99.812.340, como se tecleó
    soloDigitos(CEDULA),                  // 99812340, sin puntos ni letra
    soloDigitos(CEDULA).slice(2, 6),      // un pedazo del medio
    APELLIDO.toLowerCase(),               // quintuña, en minúscula
    'quintuna',                           // y sin la tilde de la ñ
    'griselda paulina',                   // por los nombres de pila
  ];

  for (const texto of buscados) {
    await page.goto(`/sistema/pacientes?q=${encodeURIComponent(texto)}`);
    await expect
      .soft(page.locator(`a[href="/sistema/pacientes/${paciente}"]`),
        `buscar «${texto}» no encontró al paciente`)
      .toBeVisible();
  }
});

test('la cédula completa trae a esa persona y a nadie más', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/pacientes?q=${encodeURIComponent(cedulaGuardada)}`);

  await expect(page.locator(`a[href="/sistema/pacientes/${paciente}"]`)).toBeVisible();
  await expect(page.locator(`a[href="/sistema/pacientes/${otroPaciente}"]`)).toHaveCount(0);
  await expect(page.locator('.cab__nota')).toContainText('1 coincide');
});

test('una cédula que no está en el registro ofrece abrir una atención con ella', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/pacientes?q=V-99.000.001');

  await expect(page.locator('.vacio')).toContainText('Ningún paciente coincide');
  await expect(page.getByRole('link', { name: /Atender a/ }))
    .toHaveAttribute('href', '/sistema/atencion/nueva?cedula=V-99.000.001');
});

test('la ficha muestra todas sus atenciones, con la anulada marcada como tal', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/pacientes/${paciente}`);

  await expect(filaDelCaso(page, primera)).toBeVisible();
  await expect(filaDelCaso(page, ultima)).toBeVisible();

  const muerta = filaDelCaso(page, anulada);
  await expect(muerta).toBeVisible();
  await expect(muerta).toHaveClass(/muerta/);
  await expect(muerta.locator('.chapa--anulada')).toHaveText('Anulada');
  // El motivo queda a la vista: anulada a secas no se puede auditar.
  await expect(muerta).toContainText(MOTIVO);

  // Y el resumen de arriba la cuenta aparte, no entre las que valen.
  await expect(recuadro(page, 'Atenciones').locator('.cifras__dato')).toHaveText('2');
  await expect(recuadro(page, 'Atenciones')).toContainText('1 anulada aparte');
});

test('el total facturado de la ficha es la suma de los renglones que cuentan', async ({ page }) => {
  const cuentan = await renglonesSumadosDe(CEDULA);
  const todos = await renglonesSumadosDe(CEDULA, true);

  /* Si la anulada no tuviera renglones cargados, los dos totales darían
     igual y esta prueba pasaría sin comprobar nada. */
  expect(todos.USD, 'la atención anulada tenía que llevar renglones').toBeGreaterThan(cuentan.USD);

  await entrar(page, 'administracion');
  await page.goto(`/sistema/pacientes/${paciente}`);

  const facturado = recuadro(page, 'Facturado en total');
  const enPantalla = montoDeTexto(await facturado.locator('.cifras__dato').innerText());
  expect(enPantalla).toBeCloseTo(cuentan.USD, 2);
  await expect(facturado).toContainText('en USD');
});

test('las alergias que muestra la ficha son las de la última atención que las escribió', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/pacientes/${paciente}`);

  const alergias = page.locator('.alergia');
  await expect(alergias).toContainText(ALERGIA);
  // Rojo: hay una alergia escrita, no un "ninguna" ni un campo en blanco.
  await expect(alergias).toHaveClass(/alergia--ojo/);
  /* De la segunda atención, no de la tercera: esa quedó anulada y lo que
     escribió no vale, aunque sea la más reciente. */
  await expect(alergias).toContainText(`N° ${ultima}`);
});

test('el enlace de atención nueva de la ficha lleva la cédula ya puesta', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/pacientes/${paciente}`);

  /* Acotado al contenido: el menú del panel tiene su propio «Nueva
     atención», que a propósito va sin cédula. */
  const enlace = page.getByRole('main').getByRole('link', { name: 'Nueva atención' });
  await expect(enlace).toHaveAttribute(
    /* Sin tipo: desde el registro se abre la pantalla que pregunta si es
       atención general o laboratorio, que es lo correcto. */
    'href', `/sistema/atencion/nueva?cedula=${encodeURIComponent(cedulaGuardada)}`,
  );

  // Y del otro lado el formulario se abre con el paciente ya reconocido.
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(cedulaGuardada)}&tipo=general`);
  await expect(page.locator('#c-cedula')).toHaveValue(cedulaGuardada);
  await expect(page.locator('.form__nota')).toContainText(NOMBRE);
});

test('corregir el contacto dice qué cambió y queda en bitácora', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/pacientes/${paciente}`);

  await page.locator('#telefono').fill('0426-1112233');
  await page.locator('#correo').fill('corregido.prueba@correo.local');
  await page.getByRole('button', { name: 'Guardar los datos' }).click();

  await expect(page.locator('.msj--bien')).toContainText('Guardado');
  /* Con tilde: el aviso dice los campos en palabras y no con el nombre de
     la columna de la base. */
  await expect(page.locator('.msj--bien')).toContainText('el teléfono');
  await expect(page.locator('.msj--bien')).toContainText('el correo');
  await expect(page.locator('#telefono')).toHaveValue('0426-1112233');
  await expect(page.locator('#correo')).toHaveValue('corregido.prueba@correo.local');

  /* Lo que había antes queda en bitácora, no en pantalla: el detalle de la
     anotación lleva el valor viejo y el nuevo de cada campo que se movió. */
  expect(await bitacoraDePaciente(paciente)).toContain('cambio_paciente');
});

test('un correo imposible rebota y no se guarda', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/pacientes/${paciente}`);

  const antes = (await pacienteEnLaBase(CEDULA)).correo;
  const campo = page.locator('#correo');
  /* Se le saca el type=email para saltear la validación del navegador: lo
     que se prueba es la del servidor, que es la que de verdad protege. */
  await campo.evaluate((e: HTMLInputElement) => { e.type = 'text'; });
  await campo.fill('arroba-no-tiene');
  await page.getByRole('button', { name: 'Guardar los datos' }).click();

  await expect(page.locator('.sis-error')).toContainText('no parece válido');
  await expect(page.locator('#correo')).toHaveValue('arroba-no-tiene');
  expect((await pacienteEnLaBase(CEDULA)).correo).toBe(antes);
});

test('un teléfono imposible rebota y no se guarda', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/pacientes/${paciente}`);

  const antes = (await pacienteEnLaBase(CEDULA)).telefono;
  await page.locator('#telefono').fill('123');
  await page.getByRole('button', { name: 'Guardar los datos' }).click();

  /* El mensaje dice cuántos dígitos contó: «123» son tres. Mostrar solo un
     ejemplo correcto al lado de lo tecleado no explicaba qué estaba mal. */
  await expect(page.locator('.sis-error')).toContainText('tiene 3 dígitos');
  await expect(page.locator('.sis-error')).toContainText('entre 7 y 15');
  // Lo tecleado vuelve a la pantalla: nadie escribe dos veces el mismo número.
  await expect(page.locator('#telefono')).toHaveValue('123');
  expect((await pacienteEnLaBase(CEDULA)).telefono).toBe(antes);
});

test('un id que no es uuid devuelve al registro en vez de reventar', async ({ page }) => {
  await entrar(page, 'administracion');

  const malos = [
    'no-es-uuid',
    '1',
    'null',
    'undefined',
    '99812340',
    // Con forma de uuid pero sin nadie detrás: también es un enlace viejo.
    '00000000-0000-0000-0000-000000000000',
  ];

  for (const malo of malos) {
    /* Sin seguir la redirección: así se ve el código que contesta la
       pantalla y no el 200 del registro al que lleva. */
    const respuesta = await page.request.get(
      `/sistema/pacientes/${malo}`, { maxRedirects: 0 },
    );
    expect.soft(respuesta.status(), `«${malo}» no debería dar ${respuesta.status()}`).toBe(302);
    expect.soft(respuesta.headers()['location'], `«${malo}» no volvió al registro`)
      .toBe('/sistema/pacientes');
  }
});

test('el registro y la ficha no desbordan a 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page, 'administracion');

  const pantallas = [
    '/sistema/pacientes',
    `/sistema/pacientes?q=${encodeURIComponent(APELLIDO)}`,
    '/sistema/pacientes?q=V-99.000.001',
    `/sistema/pacientes/${paciente}`,
  ];

  for (const pantalla of pantallas) {
    await page.goto(pantalla);
    const medida = await anchos(page);
    /* Un píxel de tolerancia: el redondeo de un borde a mitad de píxel no
       es un desborde, y se nota igual si algo se sale de verdad. */
    expect
      .soft(medida.documento, `${pantalla} mide ${medida.documento} en ${medida.ventana}`)
      .toBeLessThanOrEqual(medida.ventana + 1);
  }
});

/* ------------------------------------------------------------------
   El rastro en la bitácora.
   ------------------------------------------------------------------ */

test('la bitácora dice de quién es la ficha que alguien abrió', async ({ page }) => {
  /* Abrir una ficha queda registrado, pero el movimiento no cuelga de
     ninguna atención: lleva el id del paciente en `detalle`. La bitácora
     resolvía el sujeto solo por la cadena atención → paciente, así que
     mostraba «vio_paciente» en crudo y un guion en "Sobre qué". Un registro
     que dice que alguien leyó datos de salud sin decir de quién no sirve
     para lo único que justifica tenerlo. */
  await entrar(page, 'administracion');
  await page.goto(`/sistema/pacientes/${paciente}`);
  await expect(page.getByRole('heading', { name: NOMBRE })).toBeVisible();

  await page.goto('/sistema/bitacora');
  const fila = page.locator('tbody tr').filter({ hasText: 'Abrió la ficha del paciente' }).first();

  await expect(fila).toBeVisible();
  await expect(fila).not.toContainText('vio_paciente'); // el verbo crudo
  await expect(fila.getByRole('link', { name: NOMBRE }))
    .toHaveAttribute('href', `/sistema/pacientes/${paciente}`);
});

test('desde una atención se llega a la ficha de la persona', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/pacientes/${paciente}`);

  /* La primera atención de la lista. Por href y no por orden: el primer
     enlace a /sistema/atencion/ de la pantalla es el botón de atención
     nueva, que no lleva a ningún caso. */
  const caso = await page.locator('a[href^="/sistema/atencion/"]').evaluateAll((enlaces) =>
    enlaces.map((e) => (e as HTMLAnchorElement).getAttribute('href'))
      .find((h) => /^\/sistema\/atencion\/[0-9a-f-]{36}$/.test(h ?? '')));
  expect(caso, 'la ficha no listó ninguna atención').toBeTruthy();

  await page.goto(caso!);

  await expect(page.getByRole('heading', { level: 1 }).getByRole('link', { name: NOMBRE }))
    .toHaveAttribute('href', `/sistema/pacientes/${paciente}`);
});

/* ------------------------------------------------------------------
   Las cuatro operaciones sobre el paciente.
   ------------------------------------------------------------------

   El cliente las pidió para administración y para recepción. Lo que se
   vigila acá es sobre todo lo que NO se puede hacer, que es la parte que
   protege el registro:

     · un documento que ya es de otro no se roba ni se fusiona en silencio;
     · un paciente con historia no se borra;
     · todo lo que se corrige queda en bitácora con lo que decía antes.
   ------------------------------------------------------------------ */

const CRUD = cedulaDePrueba(8, 4);
const CRUD_OTRO = cedulaDePrueba(8, 5);
const CRUD_CORREGIDO = cedulaDePrueba(8, 6);
const NOMBRE_CRUD = 'Registrado A Mano de Prueba';

test.describe('crear, corregir y borrar', () => {
  test.afterAll(async () => {
    await borrarPacientes(CRUD, CRUD_OTRO, CRUD_CORREGIDO);
  });

  test('recepción registra un paciente sin abrirle atención', async ({ page }) => {
    await entrar(page, 'recepcionista');
    await page.goto('/sistema/pacientes/nuevo');

    await page.getByLabel('Nombres y apellidos').fill(NOMBRE_CRUD);
    await page.locator('#documento').fill(CRUD);
    await page.locator('#sexo').selectOption('Femenino');
    await page.locator('#telefono').fill('0414-7778899');
    await page.locator('#correo').fill('crud.prueba@correo.local');
    await page.getByRole('button', { name: 'Registrar' }).click();

    await expect(page).toHaveURL(/\/sistema\/pacientes\/[0-9a-f-]{36}\?nuevo=1$/);
    await expect(page.locator('.msj--bien')).toContainText('Quedó registrado');

    const ficha = await pacienteEnLaBase(CRUD);
    expect(ficha.nombre).toBe(NOMBRE_CRUD);
    expect(ficha.correo).toBe('crud.prueba@correo.local');

    /* Y queda sin ninguna atención, que es el punto: se registró sin
       inventarle una consulta que no tuvo. */
    await expect(page.locator('.suelto--vacio')).toContainText('todavía no tiene ninguna atención');
  });

  test('el mismo documento no se registra dos veces', async ({ page }) => {
    await entrar(page, 'administracion');
    await page.goto('/sistema/pacientes/nuevo');
    await page.getByLabel('Nombres y apellidos').fill('Otro Nombre de Prueba');
    await page.locator('#documento').fill(CRUD);
    await page.getByRole('button', { name: 'Registrar' }).click();

    await expect(page.locator('.sis-error')).toContainText('Ya hay un paciente con ese documento');
    await expect(page.locator('.sis-error')).toContainText(NOMBRE_CRUD);
    // Y lo tecleado no se pierde.
    await expect(page.getByLabel('Nombres y apellidos')).toHaveValue('Otro Nombre de Prueba');
  });

  test('se corrige el nombre y el documento, y queda en bitácora', async ({ page }) => {
    const antes = await pacienteEnLaBase(CRUD);
    await entrar(page, 'recepcionista');
    await page.goto(`/sistema/pacientes/${antes.id}`);

    await page.locator('#nombre').fill('Corregida A Mano de Prueba');
    await page.locator('#documento').fill(CRUD_CORREGIDO);
    await page.getByRole('button', { name: 'Guardar los datos' }).click();

    await expect(page.locator('.msj--bien')).toContainText('el nombre');
    await expect(page.locator('.msj--bien')).toContainText('el documento');

    const ahora = await pacienteEnLaBase(CRUD_CORREGIDO);
    expect(ahora.id).toBe(antes.id);          // es la misma ficha
    expect(ahora.nombre).toBe('Corregida A Mano de Prueba');

    expect(await bitacoraDePaciente(antes.id)).toContain('cambio_paciente');
  });

  test('un documento que ya es de otro no se roba', async ({ page }) => {
    /* Dos fichas de la misma persona son un problema; juntarlas en silencio
       —mover atenciones, elegir qué nombre gana— es un problema peor. */
    await entrar(page, 'administracion');
    await page.goto('/sistema/pacientes/nuevo');
    await page.getByLabel('Nombres y apellidos').fill('Vecino De Documento de Prueba');
    await page.locator('#documento').fill(CRUD_OTRO);
    await page.getByRole('button', { name: 'Registrar' }).click();
    await expect(page).toHaveURL(/\?nuevo=1$/);

    const vecino = await pacienteEnLaBase(CRUD_OTRO);
    await page.goto(`/sistema/pacientes/${vecino.id}`);
    await page.locator('#documento').fill(CRUD_CORREGIDO);
    await page.getByRole('button', { name: 'Guardar los datos' }).click();

    await expect(page.locator('.sis-error')).toContainText('ya es de');
    await expect(page.locator('.sis-error')).toContainText('juntar las dos fichas a mano');
    // Y el vecino se quedó con el suyo.
    expect((await pacienteEnLaBase(CRUD_OTRO)).id).toBe(vecino.id);
  });

  test('una ficha sin atenciones se borra, escribiendo el documento', async ({ page }) => {
    const vecino = await pacienteEnLaBase(CRUD_OTRO);
    await entrar(page, 'recepcionista');
    await page.goto(`/sistema/pacientes/${vecino.id}`);

    await expect(page.locator('.borrar')).toContainText('se puede borrar');

    // Con el documento mal escrito no se borra.
    await page.locator('#confirma').fill('V-00.000.000');
    await page.getByRole('button', { name: 'Borrar esta ficha' }).click();
    await expect(page.locator('.sis-error')).toContainText('escribir el documento');

    await page.locator('#confirma').fill(CRUD_OTRO);
    await page.getByRole('button', { name: 'Borrar esta ficha' }).click();
    await expect(page).toHaveURL(/\/sistema\/pacientes\?borrado=1$/);
    await expect(page.locator('.msj--bien')).toContainText('se borró');

    const quedan = await conBase((sql) => sql`
      SELECT 1 FROM paciente WHERE cedula_busca = ${soloDigitos(CRUD_OTRO)}`);
    expect(quedan.length).toBe(0);
  });

  test('un paciente con historia no se borra: se corrige', async ({ page }) => {
    await entrar(page, 'administracion');
    await page.goto(`/sistema/pacientes/${paciente}`);
    await expect(page.locator('.borrar')).toContainText('atenciones registradas');
    await expect(page.getByRole('button', { name: 'Borrar esta ficha' })).toHaveCount(0);
  });

  test('el médico ve los datos pero no los edita ni los borra', async ({ page }) => {
    await entrar(page, 'medico');
    await page.goto(`/sistema/pacientes/${paciente}`);
    await expect(page.locator('#nombre')).toHaveCount(0);
    await expect(page.locator('.contacto')).toBeVisible();
    await expect(page.locator('.borrar')).toHaveCount(0);

    await page.goto('/sistema/pacientes/nuevo');
    await expect(page).toHaveURL(/\/sistema\/sin-permiso/);
  });
});
