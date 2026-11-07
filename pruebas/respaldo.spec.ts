/**
 * El aviso de los respaldos.
 *
 * El modo más común de quedarse sin respaldo no es no tener uno: es creer
 * que se está haciendo. El servicio se cae, el disco se llena, cambia la
 * clave de la base, y las copias dejan de hacerse en silencio.
 *
 * Por eso lo que se prueba acá no es que se haga el respaldo —eso lo hace un
 * servicio aparte— sino que el panel DIGA la verdad sobre él: que avise
 * cuando no hay, cuando el último falló y cuando ya se puso viejo. Un aviso
 * que solo sabe decir "todo bien" no sirve para nada.
 */
import { test, expect } from '@playwright/test';
import { conBase, entrar } from './apoyo';

test.describe.configure({ mode: 'serial' });

/** Deja la tabla como se pide y devuelve el panel listo para mirar. */
async function conRespaldos(filas: { horas: number; estado: 'ok' | 'fallo'; detalle?: string }[]) {
  await conBase(async (sql) => {
    await sql`DELETE FROM respaldo`;
    for (const f of filas) {
      await sql`
        INSERT INTO respaldo (momento, estado, archivo, bytes, detalle)
        VALUES (now() - make_interval(hours => ${f.horas}), ${f.estado},
                ${f.estado === 'ok' ? 'atenmefa-prueba.sql.gz.enc' : null},
                ${f.estado === 'ok' ? 1_468_006 : null},
                ${f.detalle ?? null})`;
    }
  });
}

test.afterAll(async () => {
  await conBase((sql) => sql`DELETE FROM respaldo`);
});

test('intentos que fallan y ninguna copia buena: avisa que falla, no que falta', async ({ page }) => {
  /* Decir "no hay ningún respaldo" cuando el servicio está intentando y
     rompiéndose se lee como que falta configurarlo, y nadie va a buscar el
     motivo. Lo que pasa es otra cosa y hay que decirla. */
  await conRespaldos([{ horas: 1, estado: 'fallo', detalle: 'no se pudo cifrar: openssl: not found' }]);
  await entrar(page, 'administracion');
  await page.goto('/sistema/tablero');

  const aviso = page.locator('.respaldo');
  await expect(aviso).toHaveClass(/respaldo--fallando/);
  await expect(aviso).toContainText('El último respaldo falló');
  await expect(aviso).toContainText('No hay ninguna copia buena todavía');
  await expect(aviso).toContainText('openssl: not found');
});

test('sin ningún respaldo lo dice, y dice qué se pierde', async ({ page }) => {
  await conRespaldos([]);
  await entrar(page, 'administracion');
  await page.goto('/sistema/tablero');

  const aviso = page.locator('.respaldo');
  await expect(aviso).toHaveClass(/respaldo--nunca/);
  await expect(aviso).toContainText('No hay ningún respaldo');
  /* Decir "no hay respaldo" sin decir qué significa deja a alguien pensando
     que es un detalle técnico. Lo que se pierde son las historias clínicas. */
  await expect(aviso).toContainText('historias clínicas');
});

test('con uno reciente y verificado no hace ruido', async ({ page }) => {
  await conRespaldos([{ horas: 3, estado: 'ok' }]);
  await entrar(page, 'administracion');
  await page.goto('/sistema/tablero');

  const aviso = page.locator('.respaldo');
  await expect(aviso).toHaveClass(/respaldo--bien/);
  await expect(aviso).toContainText('respaldada y verificada');
  await expect(aviso).toContainText('hace 3 horas');
  await expect(aviso).toContainText('1,4 MB');
});

test('si el último intento falló lo dice, aunque haya una copia buena atrás', async ({ page }) => {
  /* Lo que importa es que algo se rompió. Que todavía quede una copia de
     ayer no es consuelo: mañana tampoco va a haber una nueva. */
  await conRespaldos([
    { horas: 26, estado: 'ok' },
    { horas: 2, estado: 'fallo', detalle: 'no se pudo volcar: conexion rechazada' },
  ]);
  await entrar(page, 'administracion');
  await page.goto('/sistema/tablero');

  const aviso = page.locator('.respaldo');
  await expect(aviso).toHaveClass(/respaldo--fallando/);
  await expect(aviso).toContainText('El último respaldo falló');
  // Y con el motivo, que es lo que permite arreglarlo sin adivinar.
  await expect(aviso).toContainText('conexion rechazada');
});

test('un respaldo viejo avisa aunque no haya fallado nada', async ({ page }) => {
  /* El servicio detenido no deja filas de fallo: deja de dejar filas. Si el
     aviso solo mirara los fallos, un servicio caído se vería igual que uno
     sano y esa es exactamente la trampa. */
  await conRespaldos([{ horas: 50, estado: 'ok' }]);
  await entrar(page, 'administracion');
  await page.goto('/sistema/tablero');

  const aviso = page.locator('.respaldo');
  await expect(aviso).toHaveClass(/respaldo--viejo/);
  await expect(aviso).toContainText('que no se respalda');
  await expect(aviso).toContainText('2 días');
});

test('el médico no ve el tablero, así que esto es de administración', async ({ page }) => {
  await conRespaldos([{ horas: 1, estado: 'ok' }]);
  await entrar(page, 'medico');
  await page.goto('/sistema/tablero');

  await expect(page).toHaveURL(/\/sistema\/sin-permiso/);
});
