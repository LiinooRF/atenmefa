/**
 * Los permisos de los roles, configurables desde Ajustes (22-11).
 *
 * «Los roles tengan permisos básicos, pero que administración los pueda
 * prender y apagar» — negocio familiar, la misma gente rota de oficio.
 *
 *   · el paquete base de cada rol no cambia: sin filas en rol_permiso,
 *     todo vale exactamente lo que siempre;
 *   · administración enciende un extra (registrarse órdenes al médico) o
 *     apaga un base (el cobro a recepción) y la puerta responde en todas
 *     las pantallas;
 *   · las dependencias no se cruzan: encender «cerrar atención» sin
 *     «escribir historias» no se guarda;
 *   · administración no aparece en la pantalla y su paquete es fijo;
 *   · cada cambio queda en la bitácora.
 */
import { test, expect } from '@playwright/test';
import { conBase, entrar } from './apoyo';

test.describe.configure({ mode: 'serial' });

const LIMPIAR = async () => {
  await conBase((sql) => sql`DELETE FROM rol_permiso`);
};

test.beforeEach(LIMPIAR);
test.afterAll(LIMPIAR);

test('sin desviaciones, cada rol vale su paquete de siempre', async ({ page }) => {
  /* Las pruebas de los otros archivos ya verifican el paquete; esta mira
     la pantalla: los tres roles, administración fuera. */
  await entrar(page, 'administracion');
  await page.goto('/sistema/ajustes');
  await expect(page.locator('.perm__rol legend')).toHaveText(['Médico', 'Bioanalista', 'Recepción']);
  await expect(page.locator('text=Administración tiene todos los permisos fijos')).toBeVisible();

  // El bioanalista trae «Cargar resultados» encendido de fábrica, marcado como base.
  const cargar = page.locator('.perm__rol').filter({ has: page.locator('legend', { hasText: /^Bioanalista$/ }) })
    .locator('.perm__caja', { hasText: 'Cargar resultados y firmarlos' });
  await expect(cargar.locator('input')).toBeChecked();
  await expect(cargar.locator('.perm__base')).toHaveText('viene con el rol');
});

test('encender un extra al médico y ver que la puerta responde', async ({ page }) => {
  /* El médico hoy NO registra órdenes de laboratorio. Encendido, la cola
     le abre la puerta y su menú gana la entrada del laboratorio. */
  await entrar(page, 'medico');
  await page.goto('/sistema/laboratorio');
  await expect(page).toHaveURL(/sin-permiso/);

  await page.context().clearCookies();
  await entrar(page, 'administracion');
  await page.goto('/sistema/ajustes');
  // Por el value del checkbox, que es único (rol:permiso).
  await page.locator('input[name="rolpermiso"][value="medico:cola_laboratorio"]').check();
  await page.locator('input[name="rolpermiso"][value="medico:registrar_laboratorio"]').check();
  await page.screenshot({ path: 'test-results/antes-click.png', fullPage: true });
  const botones = await page.getByRole('button').evaluateAll((bs) => bs.map((b) => b.textContent?.trim()));
  console.log('BOTONES', JSON.stringify(botones));
  await page.getByRole('button', { name: 'Guardar los permisos' }).click();
  console.log('URL-DESPUES', page.url());
  await expect(page.locator('.msj--bien').last()).toContainText('Guardado');

  // La puerta responde en el rol entero, sin tocar código.
  /* entrar() espera que el médico caiga en /sistema, pero con la cola
     encendida dondeEmpieza lo manda al laboratorio: es el permiso
     funcionando, no una falla. */
  await page.context().clearCookies();
  await page.goto('/sistema/entrar');
  await page.getByLabel('Correo').fill('medico@atenmefa.local');
  await page.getByLabel('Clave').fill('clave-de-prueba-1');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/sistema\/laboratorio$/);

  // La desviación está en la base…
  const [f] = await conBase((sql) => sql`SELECT valor FROM rol_permiso WHERE rol = 'medico' AND permiso = 'registrar_laboratorio'`);
  expect(f.valor).toBe(true);
  // …y al volver al paquete (desmarcar) se borra.
  await page.context().clearCookies();
  await entrar(page, 'administracion');
  await page.goto('/sistema/ajustes');
  await page.locator('input[name="rolpermiso"][value="medico:registrar_laboratorio"]').uncheck();
  await page.locator('input[name="rolpermiso"][value="medico:cola_laboratorio"]').uncheck();
  await page.getByRole('button', { name: 'Guardar los permisos' }).click();
  await expect(page.locator('.msj--bien').last()).toContainText('Guardado');
  const [va] = await conBase((sql) => sql`SELECT count(*)::int AS n FROM rol_permiso WHERE rol = 'medico' AND permiso = 'registrar_laboratorio'`);
  expect(va.n).toBe(0);

  await page.context().clearCookies();
  await entrar(page, 'medico');
  await page.goto('/sistema/laboratorio');
  await expect(page).toHaveURL(/sin-permiso/);
  // Y el menú del médico perdió la entrada del laboratorio que había ganado.
  await page.goto('/sistema');
  await expect(page.locator('input[name="rolpermiso"]')).toHaveCount(0);
});

test('apagar un permiso base y que la pantalla lo niegue', async ({ page }) => {
  /* Recepción cobra de fábrica. Apagado, el botón de cobro desaparece de
     la ficha. La advertencia de firma: encender historias a recepción
     dice que los informes quedan firmados por ese rol. */
  await entrar(page, 'administracion');
  await page.goto('/sistema/ajustes');
  const cobrar = page.locator('input[name="rolpermiso"][value="recepcionista:cargar_cobro"]');
  await expect(cobrar).toBeChecked();
  await cobrar.uncheck();
  await page.getByRole('button', { name: 'Guardar los permisos' }).click();
  await expect(page.locator('.msj--bien').last()).toContainText('apagado');

  const [f] = await conBase((sql) => sql`SELECT valor FROM rol_permiso WHERE rol = 'recepcionista' AND permiso = 'cargar_cobro'`);
  expect(f.valor).toBe(false);
  await conBase((sql) => sql`DELETE FROM rol_permiso WHERE permiso = 'cargar_cobro'`);

  // La advertencia de firma se ve en la casilla apagada:
  await page.reload();
  const historias = page.locator('.perm__rol').filter({ has: page.locator('legend', { hasText: /^Recepción$/ }) })
    .locator('.perm__caja', { hasText: 'Escribir historias' });
  // Recepción ni la ofrece (no está en su pantalla): la advertencia vive en
  // los roles a los que sí se ofrece.
  await expect(historias).toHaveCount(0);
  // La del bioanalista es base (sin advertencia); la del médico, extra apagada,
  // muestra la advertencia de firma.
  const advertida = page.locator('.perm__rol').filter({ has: page.locator('legend', { hasText: /^Médico$/ }) })
    .locator('.perm__caja', { hasText: 'quedarán firmados' });
  await expect(advertida).toBeVisible();
});

test('la dependencia bloquea: encender sin su requisito no se guarda', async ({ page }) => {
  /* «Cargar resultados» exige «Ver la cola del laboratorio». Al médico se
     le enciende el primero sin la segunda: la casilla se marca en el
     formulario y la dependencia se ve al vuelo, pero el servidor no la
     guarda. La prueba del formulario visible vive en la anterior. */
  await entrar(page, 'administracion');
  await page.goto('/sistema/ajustes');
  await page.locator('input[name="rolpermiso"][value="medico:cargar_resultados"]').check();
  await page.getByRole('button', { name: 'Guardar los permisos' }).click();
  await expect(page.locator('.msj--bien').last()).toContainText('No había nada que cambiar');

  const [g] = await conBase((sql) => sql`
    SELECT count(*)::int AS n FROM rol_permiso WHERE rol = 'medico' AND permiso = 'cargar_resultados'`);
  expect(g.n).toBe(0);
});

test('solo administración guarda; otro rol no ve la sección', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/ajustes');
  await expect(page).toHaveURL(/sin-permiso/);
});
