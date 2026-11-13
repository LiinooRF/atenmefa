/**
 * Registrar una atención, guardarla a medias y terminarla después.
 *
 * Es el camino que hace el médico en la tablet: empieza la historia, lo
 * interrumpen, guarda lo que tiene y vuelve a la bandeja de borradores a
 * terminarla. Lo que se vigila acá es que el borrador se guarde incompleto
 * a propósito, que una atención no se cierre sin lo obligatorio, que al
 * terminarla no nazca un caso nuevo y que lo cerrado ya no se toque.
 *
 * Las pruebas van en serie porque comparten el mismo caso de principio a
 * fin, igual que lo comparte el médico.
 */
import { test, expect } from '@playwright/test';
import {
  FICHA, abrirSeccion, borrarPacientes, cedulaDePrueba, crearAtencionCerrada, crearBorrador,
  cuantasAtenciones, entrar, historiaMinima, llenar, numeroDelCaso, conBase,
} from './apoyo';

test.describe.configure({ mode: 'serial' });

/** Un dígito por archivo de pruebas: el 1 es este. */
const CEDULA_BORRADOR = cedulaDePrueba(1, 0);
const CEDULA_CERRADA = cedulaDePrueba(1, 1);
const CEDULA_SIN_GUARDAR = cedulaDePrueba(1, 2);

const NOMBRE_BORRADOR = 'Ana Teresa Rangel de Prueba';
const NOMBRE_CERRADA = 'Pedro José Oliveros de Prueba';

/** Se llenan en el camino y las usan las pruebas que vienen después. */
let borrador = '';
let numeroBorrador = '';
let cerrada = '';

test.afterAll(async () => {
  await borrarPacientes(CEDULA_BORRADOR, CEDULA_CERRADA, CEDULA_SIN_GUARDAR);
});

test('un borrador se guarda con solo el nombre y la cédula', async ({ page }) => {
  await entrar(page);

  borrador = await crearBorrador(page, {
    nombre: NOMBRE_BORRADOR,
    cedula: CEDULA_BORRADOR,
  });
  numeroBorrador = await numeroDelCaso(page);

  await expect(page.locator('.chapa')).toHaveText('Borrador');
  await expect(page.locator('.cab__linea')).toContainText(NOMBRE_BORRADOR);
  expect(numeroBorrador).not.toBe('');
});

test('la bandeja de borradores dice cuánto falta para poder cerrar', async ({ page }) => {
  await entrar(page);
  await page.goto('/sistema/borradores');

  const fila = page.locator('.pend li', { hasText: NOMBRE_BORRADOR });
  await expect(fila).toContainText(CEDULA_BORRADOR);

  /* Del borrador solo se escribieron el nombre y la cédula; la fecha, la
     hora de inicio y el médico los precarga el formulario. De los doce
     campos obligatorios del modelo quedan siete, y la pantalla nombra los
     tres primeros y cuenta el resto. */
  await expect(fila).toContainText('Faltan 7 campos');
  await expect(fila).toContainText('edad, sexo, lugar de atención y 4 más');

  /* La fila entra directo a la edición, no a la ficha. El `.first()` es
     necesario: ahora la fila tiene dos enlaces, el de la fila y el de
     borrar. */
  await fila.getByRole('link').first().click();
  await expect(page).toHaveURL(`/sistema/atencion/${borrador}/editar`);
});

test('sin los campos obligatorios el navegador no deja cerrar', async ({ page }) => {
  await entrar(page);
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA_SIN_GUARDAR)}&tipo=general`);

  await llenar(page, { nombre: 'Nadie de Prueba' });
  // Cerrar solo se ofrece en el último paso: el médico llega avanzando.
  const pasos = await page.locator('[data-ir]').count();
  await page.locator(`[data-ir="${pasos - 1}"]`).click();
  await page.getByRole('button', { name: 'Cerrar atención' }).click();

  /* El botón de cerrar no lleva formnovalidate, al revés que el de
     borrador, así que la validación del propio navegador lo detiene en el
     primer obligatorio vacío. Antes era la edad; ya no lo es, porque con
     la fecha de nacimiento alcanza y el HTML no sabe exigir «esto o
     aquello»: esa regla la cuida el servidor, y la cumple la prueba de más
     abajo. El primer obligatorio que sí bloquea es el sexo. Seguimos en el
     formulario con lo tecleado delante; si hubiera cerrado, esto ya sería
     una ficha. */
  await expect(page.locator('#c-sexo:invalid')).toHaveCount(1);
  await expect(page.locator('#c-nombre')).toHaveValue('Nadie de Prueba');

  /* Seguimos en el formulario, no en una ficha. La dirección ya no es
     /nueva porque el guardado automático creó el borrador apenas hubo
     nombre y cédula: eso es lo que queremos, que nada se pierda. Lo que
     importa acá es que NO se cerró. */
  await expect(page).toHaveURL(/\/(nueva|editar)/);
  await expect(page.getByRole('button', { name: 'Cerrar atención' })).toBeVisible();

  // Quedó como borrador, nunca como cerrada.
  const estados = await conBase(
    (sql) => sql`
      SELECT a.estado FROM atencion a
        JOIN paciente p ON p.id = a.paciente_id
       WHERE p.cedula_busca = ${CEDULA_SIN_GUARDAR.replace(/\D/g, '')}`,
  );
  expect(estados.every((e) => e.estado === 'borrador')).toBe(true);
});

test('el servidor tampoco cierra un borrador incompleto', async ({ page, baseURL }) => {
  await entrar(page);

  /* La validación del navegador se puede saltar —un formulario viejo en una
     pestaña dormida, una tablet con JavaScript a medias— así que el guardia
     de verdad está en el servidor. Se envía el formulario a mano.
     La cabecera Origin hace falta: Astro rechaza el POST sin ella. */
  const respuesta = await page.request.post(`/sistema/atencion/${borrador}/editar`, {
    headers: { origin: baseURL! },
    form: { accion: 'cerrar', nombre: NOMBRE_BORRADOR, cedula: CEDULA_BORRADOR },
  });

  expect(respuesta.ok()).toBe(true);
  expect(await respuesta.text()).toContain('Falta completar');

  // Sigue siendo un borrador.
  await page.goto(`/sistema/atencion/${borrador}`);
  await expect(page.locator('.chapa')).toHaveText('Borrador');
});

test('cerrar con todo completo crea el caso y aparece en la lista', async ({ page }) => {
  await entrar(page);

  cerrada = await crearAtencionCerrada(page, {
    nombre: NOMBRE_CERRADA,
    cedula: CEDULA_CERRADA,
    sexo: 'Masculino',
  });
  const numero = await numeroDelCaso(page);

  await expect(page.locator('.chapa')).toHaveText('Cerrada');
  await expect(page.locator('.ficha', { has: page.getByRole('heading', { name: 'Evaluación' }) }))
    .toContainText(historiaMinima.motivo);

  await page.goto(`/sistema?q=${encodeURIComponent(CEDULA_CERRADA)}`);
  const fila = page.locator('ul.casos li', { hasText: NOMBRE_CERRADA });
  await expect(fila).toBeVisible();
  await expect(fila).toContainText(numero);
  await expect(fila).toContainText(historiaMinima.idx);
});

test('un borrador no aparece en la lista de casos', async ({ page }) => {
  await entrar(page);

  // La lista es de casos atendidos: solo las cerradas entran.
  await page.goto(`/sistema?q=${encodeURIComponent(CEDULA_BORRADOR)}`);

  await expect(page.getByRole('heading', { name: 'Ningún caso coincide' })).toBeVisible();
  await expect(page.getByText(NOMBRE_BORRADOR)).toHaveCount(0);
});

test('reabrir un borrador trae lo que se había escrito', async ({ page }) => {
  await entrar(page);
  await page.goto(`/sistema/atencion/${borrador}/editar`);

  await expect(page.locator('#c-nombre')).toHaveValue(NOMBRE_BORRADOR);
  await expect(page.locator('#c-cedula')).toHaveValue(CEDULA_BORRADOR);
  // La cabecera dice sobre qué caso se está escribiendo.
  await expect(page.locator('.form__cab')).toContainText(numeroBorrador);
  await expect(page.locator('.form__cab')).toContainText('Faltan 7 campos obligatorios');
});

test('lo que se agrega al borrador se guarda sobre el mismo caso', async ({ page }) => {
  await entrar(page);
  await page.goto(`/sistema/atencion/${borrador}/editar`);

  // "Hábitos y antecedentes" es plegable: hay que abrirla para escribir.
  await abrirSeccion(page, 'antecedentes');
  await llenar(page, { alergias: 'Ninguna que refiera', edad: '33' });
  await page.getByRole('button', { name: 'Guardar y salir' }).click();
  await expect(page).toHaveURL(FICHA);

  // Se actualizó la misma fila: ni un caso nuevo ni un número nuevo.
  expect(await cuantasAtenciones(CEDULA_BORRADOR)).toBe(1);
  expect(await numeroDelCaso(page)).toBe(numeroBorrador);

  /* Y al volver a abrirlo, lo anotado sigue ahí y su sección viene
     desplegada: una alergia no puede quedar escondida detrás de un título
     plegado. Con el formulario por pasos vive en su paso, así que se llega
     tocando el paso, no desplegando nada. */
  await page.goto(`/sistema/atencion/${borrador}/editar`);
  await expect(page.locator('#c-alergias')).toHaveValue('Ninguna que refiera');
  await expect(page.locator('#s-antecedentes details[open]')).toHaveCount(1);

  const hoja = await page.locator('#c-alergias').evaluate(
    (e) => Number((e.closest('[data-hoja]') as HTMLElement).dataset.hoja),
  );
  await page.locator(`[data-ir="${hoja}"]`).click();
  await expect(page.locator('#c-alergias')).toBeVisible();
  await expect(page.locator('.form__cab')).toContainText('Faltan 6 campos obligatorios');
});

test('una atención cerrada no se puede editar', async ({ page }) => {
  await entrar(page);
  await page.goto(`/sistema/atencion/${cerrada}/editar`);

  // Se explica en la misma dirección en vez de devolver en silencio.
  await expect(page.getByRole('heading', { name: 'Esta atención ya está cerrada' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver la ficha del caso' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar y salir' })).toHaveCount(0);
  await expect(page.locator('#c-nombre')).toHaveCount(0);
});

test('solo el borrador ofrece continuar la atención desde la ficha', async ({ page }) => {
  await entrar(page);

  await page.goto(`/sistema/atencion/${borrador}`);
  await expect(page.getByRole('link', { name: 'Continuar la atención' })).toBeVisible();

  await page.goto(`/sistema/atencion/${cerrada}`);
  await expect(page.getByRole('link', { name: 'Continuar la atención' })).toHaveCount(0);
});

test('terminar el borrador lo cierra y le deja el mismo número', async ({ page }) => {
  await entrar(page);
  await page.goto(`/sistema/atencion/${borrador}/editar`);

  await llenar(page, historiaMinima);
  await page.getByRole('button', { name: 'Cerrar atención' }).click();
  await expect(page).toHaveURL(`/sistema/atencion/${borrador}`);

  await expect(page.locator('.chapa')).toHaveText('Cerrada');
  expect(await numeroDelCaso(page)).toBe(numeroBorrador);
  expect(await cuantasAtenciones(CEDULA_BORRADOR)).toBe(1);

  // Ya no está en la bandeja de pendientes y sí en la lista de casos.
  await page.goto('/sistema/borradores');
  await expect(page.getByText(NOMBRE_BORRADOR)).toHaveCount(0);

  await page.goto(`/sistema?q=${encodeURIComponent(CEDULA_BORRADOR)}`);
  await expect(page.locator('ul.casos li', { hasText: NOMBRE_BORRADOR })).toBeVisible();
});
