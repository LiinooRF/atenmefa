/**
 * Mandarle el documento al paciente.
 *
 * Tres cosas, que son las tres que el cliente pidió:
 *
 *   · es MANUAL. No hay camino que envíe solo: ni al guardar un resultado,
 *     ni al cerrar una atención, ni al entregar una orden;
 *   · se CONFIRMA la dirección. Llega escrita la que el paciente tenga
 *     registrada; si no tiene, el campo viene vacío; si está mal, se
 *     corrige en la misma pantalla y queda guardada en su ficha;
 *   · nace APAGADO. Con las credenciales cargadas y sin CORREO_ACTIVO=1 la
 *     pantalla arma el mensaje y dice que no mandó nada. Es un sistema que
 *     le escribe a pacientes de un centro de salud.
 *
 * Nada de esto manda un correo de verdad, y no es una limitación de la
 * prueba: es la misma garantía que se está probando.
 */
import { test, expect } from '@playwright/test';
import {
  conBase, entrar, cedulaDePrueba, idDeLaFicha, FICHA, historiaMinima, llenar,
} from './apoyo';

test.describe.configure({ mode: 'serial' });

const CEDULA = cedulaDePrueba(14, 0);
const NOMBRE = 'Envío de Prueba Pérez';
const CORREO_VIEJO = 'viejo.prueba@correo.local';
const CORREO_NUEVO = 'nuevo.prueba@correo.local';

let caso = '';
let CASO_NUMERO = 0;

const limpiar = () =>
  conBase(async (sql) => {
    const busca = CEDULA.replace(/\D/g, '');
    const suyas = sql`SELECT a.id FROM atencion a JOIN paciente p ON p.id = a.paciente_id
                       WHERE p.cedula_busca = ${busca}`;
    await sql`DELETE FROM bitacora WHERE atencion_id IN (${suyas})`;
    await sql`DELETE FROM renglon  WHERE atencion_id IN (${suyas})`;
    await sql`DELETE FROM atencion WHERE paciente_id IN (
                SELECT id FROM paciente WHERE cedula_busca = ${busca})`;
    await sql`DELETE FROM paciente WHERE cedula_busca = ${busca}`;
  });

test.beforeAll(limpiar);
test.afterAll(limpiar);

test('se registra y se cierra una atención con correo y celular', async ({ page }) => {
  /* Cerrada y no borrador: el documento nace con su PIN al cerrarse, y el
     mensaje de WhatsApp lleva la dirección de verificación justamente
     porque hay PIN. Mandarle a alguien algo que todavía puede cambiar es
     otro caso, y tiene su propio aviso en pantalla. */
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/nueva?cedula=${encodeURIComponent(CEDULA)}&tipo=general`);
  await page.locator('#c-nombre').fill(NOMBRE);
  await page.locator('#c-telefono').fill('0414-8939176');
  await page.locator('#c-correo').fill(CORREO_VIEJO);
  await llenar(page, historiaMinima);
  await page.getByRole('button', { name: 'Cerrar atención' }).click();
  await expect(page).toHaveURL(FICHA);
  caso = idDeLaFicha(page.url());

  const [cerrada] = await conBase((sql) => sql`
    SELECT numero::int AS numero, estado::text AS estado, pin
      FROM atencion WHERE id = ${caso}`);
  expect(cerrada.estado).toBe('cerrada');
  expect(cerrada.pin).toMatch(/^\d{6}$/);
  CASO_NUMERO = cerrada.numero;
});

test('llega escrito el correo registrado del paciente', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${caso}/enviar`);
  await expect(page.getByLabel('Correo del paciente')).toHaveValue(CORREO_VIEJO);
  await expect(page.locator('.sis-campo .pista').first()).toContainText('Es el que tiene registrado');
});

test('con el envío apagado no se manda nada, y se dice', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${caso}/enviar`);
  await page.getByRole('button', { name: 'Enviar ahora' }).click();

  await expect(page.locator('.msj--simulado')).toContainText('No se envió nada');
  await expect(page.locator('.msj--simulado')).toContainText('CORREO_ACTIVO');
  // Y no quedó anotado ningún envío, porque no hubo ninguno.
  const envios = await conBase((sql) => sql`
    SELECT 1 FROM bitacora WHERE atencion_id = ${caso} AND accion = 'envio'`);
  expect(envios.length).toBe(0);
});

test('una dirección mal escrita se rechaza antes de intentar nada', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${caso}/enviar`);
  const campo = page.getByLabel('Correo del paciente');
  /* Se saltea la validación del navegador a propósito: lo que se prueba es
     la del servidor, que es la que de verdad protege. */
  await campo.evaluate((e: HTMLInputElement) => { e.type = 'text'; });
  await campo.fill('esto no es un correo');
  await page.getByRole('button', { name: 'Enviar ahora' }).click();
  await expect(page.locator('.sis-error')).toContainText('no parece válida');
});

test('corregir la dirección la guarda en la ficha del paciente', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/${caso}/enviar`);
  await page.getByLabel('Correo del paciente').fill(CORREO_NUEVO);
  await page.getByRole('button', { name: 'Enviar ahora' }).click();

  /* No se envió —sigue apagado— pero la corrección del dato sí quedó: se
     guarda antes de intentar el envío justamente para que una falla del
     otro lado no haga perder lo que la persona acaba de teclear. */
  const [persona] = await conBase((sql) => sql`
    SELECT correo FROM paciente WHERE cedula_busca = ${CEDULA.replace(/\D/g, '')}`);
  expect(persona.correo).toBe(CORREO_NUEVO);
});

test('destildando el guardado, la dirección no se pisa', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${caso}/enviar`);
  await page.getByLabel('Correo del paciente').fill('solo.esta.vez@correo.local');
  await page.locator('input[name="guardar"]').uncheck();
  await page.getByRole('button', { name: 'Enviar ahora' }).click();

  const [persona] = await conBase((sql) => sql`
    SELECT correo FROM paciente WHERE cedula_busca = ${CEDULA.replace(/\D/g, '')}`);
  expect(persona.correo).toBe(CORREO_NUEVO);
});

test('el WhatsApp abre el chat con el mensaje puesto y sin dato clínico', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${caso}/enviar`);

  const enlace = page.getByRole('link', { name: 'Abrir el chat' });
  const url = new URL((await enlace.getAttribute('href'))!);

  // 0414-8939176 → 584148939176, que es lo que entiende wa.me.
  expect(url.host).toBe('wa.me');
  expect(url.pathname).toBe('/584148939176');

  const texto = url.searchParams.get('text')!;
  expect(texto).toContain('Atenmefa');
  expect(texto).toContain(`N° ${CASO_NUMERO}`);
  /* Con el nombre del paciente: el cliente lo pidió expresamente, y un
     mensaje que arranca «Buenas, le escribimos de…» se lee como una cadena.
     Va el primer nombre, que es lo único que se puede sacar sin adivinar de
     un campo de texto libre con dos apellidos. */
  expect(texto).toContain('Buenas, Envío.');
  /* Sin la dirección de verificación: esa página confirma que un papel es
     auténtico, no muestra el informe. Mandársela al paciente sería
     prometerle algo que no va a encontrar ahí. */
  expect(texto).not.toContain('/verificar');
  /* Un chat lo lee quien tenga el teléfono en la mano: el mensaje dice que
     está listo y cómo verlo, no qué tiene la persona. */
  expect(texto).not.toContain(historiaMinima.idx);
});

test('sin un número usable no se ofrece el botón', async ({ page }) => {
  await conBase((sql) => sql`
    UPDATE paciente SET telefono = NULL, whatsapp = NULL
     WHERE cedula_busca = ${CEDULA.replace(/\D/g, '')}`);

  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${caso}/enviar`);
  // El botón está, pero apagado: no abre un chat con un número inexistente.
  await expect(page.getByRole('link', { name: 'Abrir el chat' })).toHaveCount(0);
  await expect(page.locator('[data-wa-abrir]')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.sis-tarjeta').last()).toContainText('Todavía no hay un número');
});

test('se le puede poner un número ahí mismo y el botón se prende', async ({ page }) => {
  /* Era lo que faltaba: si recepción no había cargado un teléfono, en esta
     pantalla no había ningún botón ni desde dónde poner uno. */
  await entrar(page, 'medico');
  await page.goto(`/sistema/atencion/${caso}/enviar`);

  const campo = page.getByLabel('Número del paciente');
  await campo.fill('0414-8939176');

  // Sin guardar nada: el enlace se arma mientras se escribe.
  const boton = page.locator('[data-wa-abrir]');
  await expect(boton).toHaveAttribute('href', /wa\.me\/584148939176\?text=/);
  await expect(boton).not.toHaveAttribute('aria-disabled', 'true');

  // A medio escribir se apaga otra vez.
  await campo.fill('0414-89');
  await expect(boton).toHaveAttribute('aria-disabled', 'true');

  // Y guardarlo lo deja en la ficha para la próxima.
  await campo.fill('0414-8939176');
  await page.getByRole('button', { name: 'Guardar el número' }).click();
  await expect(page.locator('.msj--bien')).toContainText('abre el chat');

  const [persona] = await conBase((sql) => sql`
    SELECT whatsapp FROM paciente WHERE cedula_busca = ${CEDULA.replace(/\D/g, '')}`);
  expect(persona.whatsapp).toBe('0414-8939176');
});
