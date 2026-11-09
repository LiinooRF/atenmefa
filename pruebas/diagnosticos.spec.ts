/**
 * El diagnóstico: catálogo CIE-10, escribir a mano, y los frecuentes.
 *
 * Lo que el cliente pidió: «una lista internacional de todos los
 * diagnósticos, pero que desde el panel se puedan seleccionar y dejar
 * arriba los más comunes… un seleccionador de diagnóstico, y si es que se
 * necesita escribir algo».
 *
 * Las dos mitades se vigilan acá, y la segunda tanto como la primera: un
 * médico frente a un paciente no puede quedarse trabado porque el catálogo
 * no tiene la palabra que él usa.
 *
 * Y la regla que sostiene todo: EL CÓDIGO Y EL TEXTO NO SE SEPARAN. Si el
 * texto se edita a mano, el código se va. Un código que dice una cosa al
 * lado de un nombre que dice otra termina impreso en la planilla de un
 * seguro, y esa es la única manera en que esta pieza puede hacer daño.
 */
import { test, expect } from '@playwright/test';
import {
  conBase, entrar, cedulaDePrueba, idDeLaFicha, FICHA, historiaMinima,
  irAlUltimoPaso, llenar, irAlPasoDe,
} from './apoyo';

test.describe.configure({ mode: 'serial' });

const CEDULA = cedulaDePrueba(15, 0);
const CEDULA_MANO = cedulaDePrueba(15, 1);
const CEDULA_RAPIDO = cedulaDePrueba(15, 2);
const NOMBRE = 'Diagnóstico de Prueba Rangel';

const limpiar = () =>
  conBase(async (sql) => {
    for (const c of [CEDULA, CEDULA_MANO, CEDULA_RAPIDO]) {
      const busca = c.replace(/\D/g, '');
      const suyas = sql`SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
                         WHERE p.cedula_busca = ${busca}`;
      await sql`DELETE FROM bitacora WHERE atencion_id IN (${suyas})`;
      await sql`DELETE FROM renglon  WHERE atencion_id IN (${suyas})`;
      await sql`DELETE FROM atencion WHERE paciente_id IN (
                  SELECT id FROM paciente WHERE cedula_busca = ${busca})`;
      await sql`DELETE FROM paciente WHERE cedula_busca = ${busca}`;
    }
    // Nadie deja marcados de una corrida para la siguiente.
    await sql`UPDATE diagnostico SET frecuente = false, orden = NULL WHERE frecuente`;
  });

test.beforeAll(limpiar);
test.afterAll(limpiar);

/* ------------------------------------------------------------------
   El catálogo está, y es el de la OMS.
   ------------------------------------------------------------------ */

test('el catálogo entró completo y con los códigos de la OMS', async () => {
  const [n] = await conBase((sql) => sql`SELECT COUNT(*)::int AS n FROM diagnostico`);
  expect(n.n).toBe(12551);

  /* Siete que se verificaron a mano contra la CIE-10 de la OMS. Si una
     edición futura del catálogo los mueve, esta prueba lo dice antes de que
     salga impreso en la planilla de un seguro.

     Y sobre todo: I10 y J00 son categorías de tres caracteres. El catálogo
     del CEMECE las publica como I10X —la X es de presentación— y acá tienen
     que haber quedado SIN la X, que es el código que pide una aseguradora. */
  const esperado: Record<string, string> = {
    I10: 'HIPERTENSIÓN ESENCIAL (PRIMARIA)',
    J00: 'RINOFARINGITIS AGUDA [RESFRIADO COMÚN]',
    'E11.9': 'DIABETES MELLITUS TIPO 2, SIN MENCIÓN DE COMPLICACIÓN',
    'N39.0': 'INFECCIÓN DE VÍAS URINARIAS, SITIO NO ESPECIFICADO',
    'K80.2': 'CÁLCULO DE LA VESÍCULA BILIAR SIN COLECISTITIS',
    'U07.1': 'COVID-19, VIRUS IDENTIFICADO',
    N40: 'HIPERPLASIA DE LA PRÓSTATA',
  };

  const filas = await conBase((sql) => sql`
    SELECT codigo, nombre, sexo FROM diagnostico
     WHERE codigo IN ${sql(Object.keys(esperado))}`);

  expect(Object.fromEntries(filas.map((f) => [f.codigo, f.nombre]))).toEqual(esperado);
  // La restricción de sexo viene del catálogo y se usa para avisar.
  expect(filas.find((f) => f.codigo === 'N40')?.sexo).toBe('Masculino');

  // Ninguna X colgada de una categoría de tres.
  const conX = await conBase((sql) => sql`
    SELECT codigo FROM diagnostico WHERE codigo LIKE '%X' LIMIT 5`);
  expect(conX.map((f) => f.codigo)).toEqual([]);
});

/* ------------------------------------------------------------------
   Buscar.
   ------------------------------------------------------------------ */

test('busca por nombre, por código, sin tildes y en cualquier orden', async ({ page }) => {
  await entrar(page, 'medico');

  const buscar = async (q: string) => {
    const r = await page.request.get(`/sistema/api/diagnosticos?q=${encodeURIComponent(q)}`);
    expect(r.status()).toBe(200);
    return (await r.json()).diagnosticos as { codigo: string; nombre: string }[];
  };

  // Las dos palabras, al revés, sin tildes y en minúscula: el mismo hallazgo.
  for (const q of ['infeccion urinaria', 'urinaria infeccion', 'INFECCIÓN URINARIA']) {
    const r = await buscar(q);
    expect(r.map((d) => d.codigo), `buscando «${q}»`).toContain('N39.0');
  }

  // Por código, en minúscula.
  expect((await buscar('i10')).map((d) => d.codigo)).toEqual(['I10']);

  /* El nombre vuelve legible y no en mayúsculas: una lista de doce mil
     renglones a gritos no se lee. */
  const [uno] = await buscar('i10');
  expect(uno.nombre).toBe('Hipertensión esencial (primaria)');
});

test('un comodín de SQL se busca como texto y no abre la lista entera', async ({ page }) => {
  await entrar(page, 'medico');
  const r = await page.request.get('/sistema/api/diagnosticos?q=%25%25%25');
  const d = (await r.json()).diagnosticos as { nombre: string }[];
  /* '%%%' tiene que buscar el carácter, no comportarse como «todo». Los que
     salgan tienen que tener un % en el nombre de verdad. */
  expect(d.every((x) => x.nombre.includes('%'))).toBe(true);
});

test('sin buscar nada devuelve la cabeza de la lista', async ({ page }) => {
  await entrar(page, 'medico');
  const r = await page.request.get('/sistema/api/diagnosticos');
  const d = (await r.json()).diagnosticos as unknown[];
  // No vacía: al abrir el campo hay que ofrecer algo.
  expect(d.length).toBe(25);
});

test('el catálogo no se abre sin sesión', async ({ page }) => {
  const r = await page.request.get('/sistema/api/diagnosticos?q=i10');
  expect(r.status()).toBe(401);
});

/* ------------------------------------------------------------------
   Elegir del catálogo, y escribir a mano.
   ------------------------------------------------------------------ */

test('elegir del catálogo guarda el nombre y el código', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}&tipo=general`);
  await page.locator('#c-nombre').fill(NOMBRE);
  /* Por `llenar` y no con un fill suelto: el formulario va por pasos y
     #c-idx vive en otro. El helper lleva la pantalla al paso del campo,
     igual que hace el médico.

     Y el diagnóstico va en una llamada aparte, al final: `llenar` sigue con
     el campo siguiente, y cambiar de paso cierra la lista de resultados —lo
     mismo que pasa cuando el médico toca otra cosa—. */
  await llenar(page, historiaMinima);
  /* La búsqueda tiene su propio campo, al lado de la lista: el de abajo
     —#c-idx— es el que se guarda, y se puede escribir a mano. Antes eran
     el mismo y la lista caía flotando encima del formulario. */
  await irAlPasoDe(page, page.locator('#c-idx'));
  await page.locator('#c-idx-buscar').fill('infeccion urinaria');
  const opcion = page.locator('#c-idx-lista li', { hasText: 'N39.0' }).first();
  await expect(opcion).toBeVisible();
  await opcion.click();

  // El texto queda legible y el código a la vista.
  await expect(page.locator('#c-idx')).toHaveValue('Infección de vías urinarias, sitio no especificado');
  await expect(page.locator('#c-idx-codigo')).toHaveValue('N39.0');
  await expect(page.locator('#c-idx-elegido')).toBeVisible();

  // El botón de cerrar solo está en el último paso.
  await irAlUltimoPaso(page);
  await page.getByRole('button', { name: 'Cerrar atención' }).click();
  await expect(page).toHaveURL(FICHA);
  const caso = idDeLaFicha(page.url());

  const [guardada] = await conBase((sql) => sql`
    SELECT datos ->> 'idx' AS idx, datos ->> 'idx_codigo' AS codigo
      FROM atencion WHERE id = ${caso}`);
  expect(guardada.idx).toBe('Infección de vías urinarias, sitio no especificado');
  expect(guardada.codigo).toBe('N39.0');

  // Y el código sale impreso: es para lo que sirve codificar.
  await page.goto(`/sistema/atencion/${caso}/documento`);
  await expect(page.locator('.hoja').first()).toContainText('(N39.0)');
});

test('si el texto se edita a mano, el código se va', async ({ page }) => {
  /* La única manera en que esto puede hacer daño: un código que dice una
     cosa al lado de un nombre que dice otra, impreso en la planilla de un
     seguro. */
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}&tipo=general`);

  await irAlPasoDe(page, page.locator('#c-idx'));
  await page.locator('#c-idx-buscar').fill('i10');
  await page.locator('#c-idx-lista li').first().click();
  await expect(page.locator('#c-idx-codigo')).toHaveValue('I10');

  await page.locator('#c-idx').pressSequentially(' con algo mío');
  await expect(page.locator('#c-idx-codigo')).toHaveValue('');
  await expect(page.locator('#c-idx-elegido')).toBeHidden();
});

test('el botón de quitar suelta el código y deja el texto', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}&tipo=general`);

  await irAlPasoDe(page, page.locator('#c-idx'));
  await page.locator('#c-idx-buscar').fill('i10');
  await page.locator('#c-idx-lista li').first().click();
  await page.locator('#c-idx-quitar').click();

  await expect(page.locator('#c-idx-codigo')).toHaveValue('');
  await expect(page.locator('#c-idx')).toHaveValue('Hipertensión esencial (primaria)');
});

test('escribir a mano sigue valiendo, sin código', async ({ page }) => {
  /* El cliente lo pidió expresamente. Un diagnóstico que el catálogo no
     tiene no puede trabar una consulta. */
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA_MANO)}&tipo=general`);
  await page.locator('#c-nombre').fill('Escrito A Mano de Prueba');
  await llenar(page, { ...historiaMinima, idx: 'Lo que el médico quiera escribir' });
  await irAlUltimoPaso(page);
  await page.getByRole('button', { name: 'Cerrar atención' }).click();
  await expect(page).toHaveURL(FICHA);

  const [guardada] = await conBase((sql) => sql`
    SELECT datos ->> 'idx' AS idx, datos ->> 'idx_codigo' AS codigo
      FROM atencion WHERE id = ${idDeLaFicha(page.url())}`);
  expect(guardada.idx).toBe('Lo que el médico quiera escribir');
  expect(guardada.codigo).toBeNull();
});

/* ------------------------------------------------------------------
   Los frecuentes.
   ------------------------------------------------------------------ */

test('el médico no administra el catálogo', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/diagnosticos');
  await expect(page).toHaveURL(/\/sistema\/sin-permiso/);
});

test('administración marca uno y queda primero en la lista del médico', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/diagnosticos');

  await expect(page.locator('.vacio')).toContainText('Todavía no hay ninguno marcado');

  await page.getByLabel('Buscar un diagnóstico').fill('rinofaringitis');
  await page.getByRole('button', { name: 'Buscar' }).click();

  const fila = page.locator('.hallados li', { hasText: 'J00' }).first();
  await fila.getByRole('button', { name: 'Dejar arriba' }).click();
  await expect(page.locator('.msj--bien')).toContainText('J00');

  await expect(page.locator('.orden li')).toHaveCount(1);
  await expect(page.locator('.orden li').first()).toContainText('J00');

  const [marcado] = await conBase((sql) => sql`
    SELECT frecuente, orden, (marcado_por IS NOT NULL) AS con_autor
      FROM diagnostico WHERE codigo = 'J00'`);
  expect(marcado.frecuente).toBe(true);
  expect(marcado.orden).toBe(1);
  expect(marcado.con_autor).toBe(true);
});

test('lo marcado sale primero cuando el médico abre el campo', async ({ page }) => {
  await entrar(page, 'medico');
  const r = await page.request.get('/sistema/api/diagnosticos');
  const d = (await r.json()).diagnosticos as { codigo: string; frecuente: boolean }[];
  expect(d[0].codigo).toBe('J00');
  expect(d[0].frecuente).toBe(true);
});

test('se reordenan y se quitan, y quitarlo no lo borra del catálogo', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/diagnosticos?q=hipertension%20esencial');
  await page.locator('.hallados li', { hasText: 'I10' }).first()
    .getByRole('button', { name: 'Dejar arriba' }).click();

  // J00 primero, I10 después: el orden es el de marcado.
  let orden = await page.locator('.orden li .cifra.orden__n ~ .orden__que small .cifra').allInnerTexts();
  expect(orden).toEqual(['J00', 'I10']);

  // Se sube el segundo.
  await page.locator('.orden li', { hasText: 'I10' }).first()
    .getByRole('button', { name: /Subir/ }).click();
  orden = await page.locator('.orden li .cifra.orden__n ~ .orden__que small .cifra').allInnerTexts();
  expect(orden).toEqual(['I10', 'J00']);

  // Y se quita uno: sale de los frecuentes, no del catálogo.
  await page.locator('.orden li', { hasText: 'J00' }).first()
    .getByRole('button', { name: 'Quitar' }).click();
  await expect(page.locator('.msj--bien')).toContainText('Sigue en el catálogo');
  await expect(page.locator('.orden li')).toHaveCount(1);

  const [sigue] = await conBase((sql) => sql`
    SELECT frecuente, orden FROM diagnostico WHERE codigo = 'J00'`);
  expect(sigue.frecuente).toBe(false);
  expect(sigue.orden).toBeNull();
});

test('lo escrito a mano aparece como candidato a codificar', async ({ page }) => {
  /* No es un reproche: es la lista de lo que falta encontrarle su código. */
  await entrar(page, 'administracion');
  await page.goto('/sistema/diagnosticos');
  await expect(page.locator('.mano')).toContainText('Lo que el médico quiera escribir');
});

test('los marcados salen como botones, a un toque y sin escribir', async ({ page }) => {
  /* Es la mitad del pedido —«que aparezcan de primero»— y es lo que hace
     que esto se use: lo de todos los días se toca una vez. Escondidos
     dentro del desplegable no servían de nada. */
  /* I10 quedó marcado en la prueba de reordenar, unas líneas más arriba:
     este archivo va en serie. Dos sesiones en una misma prueba no se
     pueden —entrar() cuenta con llegar al formulario de login y con una
     sesión abierta /sistema/entrar redirige al panel—. */
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA_RAPIDO)}&tipo=general`);

  /* Al paso del diagnóstico: el formulario va por pasos y arranca en el
     del paciente, así que los botones existen pero están escondidos. */
  await llenar(page, { idx: '' });

  const rapido = page.locator('.dx__rapido', { hasText: 'I10' });
  await expect(rapido).toBeVisible();
  await expect(rapido).toHaveAttribute('aria-pressed', 'false');

  await rapido.click();
  await expect(page.locator('#c-idx')).toHaveValue('Hipertensión esencial (primaria)');
  await expect(page.locator('#c-idx-codigo')).toHaveValue('I10');
  // El que está puesto se ve puesto.
  await expect(rapido).toHaveAttribute('aria-pressed', 'true');

  // Y si se escribe encima, el código se va y el botón se apaga.
  await page.locator('#c-idx').pressSequentially(' algo mío');
  await expect(page.locator('#c-idx-codigo')).toHaveValue('');
  await expect(rapido).toHaveAttribute('aria-pressed', 'false');
});

test('sin ninguno marcado no hay botones, y el campo sigue sirviendo', async ({ page }) => {
  await conBase((sql) => sql`UPDATE diagnostico SET frecuente = false, orden = NULL WHERE frecuente`);
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA_RAPIDO)}&tipo=general`);
  await irAlPasoDe(page, page.locator('#c-idx'));
  await expect(page.locator('.dx__rapidos')).toHaveCount(0);
  await page.locator('#c-idx-buscar').fill('resfriado');
  await expect(page.locator('#c-idx-lista li').first()).toContainText('J00');
});
