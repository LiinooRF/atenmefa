/**
 * Recepción admite el caso y el médico lo encuentra empezado.
 *
 * Lo que se vigila acá no es que la pantalla guarde —eso lo prueba
 * cualquier formulario— sino las dos cosas que la hacen aceptable:
 *
 *   1. que recepción NO pueda escribir nada clínico, ni por pantalla ni
 *      mandando los campos a mano en el cuerpo del formulario;
 *   2. que el caso admitido le llegue al médico sin que nadie se lo avise
 *      por otro medio.
 */
import { test, expect } from '@playwright/test';
import {
  CUENTAS, cedulaDePrueba, conBase, entrar, salir, llenar, borrarPacientes,
  soloDigitos, hoyEnCaracas,
} from './apoyo';

test.describe.configure({ mode: 'serial' });

const DE_RECEPCION = cedulaDePrueba(18, 1);
const PARA_OTRO = cedulaDePrueba(18, 2);
const POR_EL_CUERPO = cedulaDePrueba(18, 3);

/* Un nombre distinto por caso: los tres se admiten igual y la pantalla los
   lista a todos, así que con el mismo nombre la prueba no puede decir cuál
   de los tres está mirando. Pasó: la que comprueba que el caso escrito sale
   de la sala de espera encontraba ahí al tocayo de otra prueba. */
const NOMBRE = {
  [DE_RECEPCION]: 'Paciente Admitido en el Mesón',
  [PARA_OTRO]: 'Paciente Para Otro Médico',
  [POR_EL_CUERPO]: 'Paciente Por El Cuerpo',
} as Record<string, string>;

/** Lo que recepción sabe preguntar en el mesón, y nada más. */
const DEL_MESON = {
  edad: '34',
  sexo: 'Femenino',
  lugar: 'En el local',
  telefono: '0414-8939176',
  aseguradora: 'Seguro de Prueba',
  motivo: 'Fiebre desde anoche',
};

/** El id de una cuenta, para comprobar a nombre de quién quedó el caso. */
const idDe = (correo: string) =>
  conBase(async (sql) => {
    const [fila] = await sql`SELECT id FROM "user" WHERE email = ${correo} LIMIT 1`;
    return String(fila.id);
  });

/** La atención de ese paciente, como está en la base. */
const atencionDe = (cedula: string) =>
  conBase(async (sql) => {
    const [fila] = await sql`
      SELECT a.id, a.numero, a.medico_id, a.abierta_por, a.estado, a.datos
        FROM atencion a
        JOIN paciente p ON p.id = a.paciente_id
       WHERE p.cedula_busca = ${soloDigitos(cedula)}
       ORDER BY a.creada DESC
       LIMIT 1`;
    return fila ?? null;
  });

/** Llena la admisión y la guarda. Devuelve el número que quedó. */
async function admitir(page: import('@playwright/test').Page, cedula: string, medico: string) {
  await page.goto(`/sistema/atencion/abrir?cedula=${encodeURIComponent(cedula)}`);
  await llenar(page, { nombre: NOMBRE[cedula], ...DEL_MESON });
  await page.locator('.medico').filter({ hasText: medico }).locator('input').check();
  await page.getByRole('button', { name: 'Admitir el caso' }).click();
  await expect(page.locator('.msj--bien')).toContainText('admitido');
}

test.afterAll(async () => {
  await borrarPacientes(DE_RECEPCION, PARA_OTRO, POR_EL_CUERPO);
});

test('el menú de recepción dice admitir y el del médico, nueva atención', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await expect(page.locator('.sis__nav a[href="/sistema/atencion/abrir"]')).toHaveCount(1);
  await expect(page.locator('.sis__nav a[href="/sistema/atencion/nueva"]')).toHaveCount(0);
  await salir(page);

  await entrar(page, 'medico');
  await expect(page.locator('.sis__nav a[href="/sistema/atencion/nueva"]')).toHaveCount(1);
  await expect(page.locator('.sis__nav a[href="/sistema/atencion/abrir"]')).toHaveCount(0);
});

test('la admisión no dibuja ni un campo clínico', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await page.goto(`/sistema/atencion/abrir?cedula=${encodeURIComponent(DE_RECEPCION)}`);

  /* Lo del mesón sí. */
  await expect(page.locator('#c-nombre')).toBeVisible();
  await expect(page.locator('#c-motivo')).toBeVisible();
  await expect(page.locator('#c-aseguradora')).toBeVisible();

  /* Lo clínico no existe en la página: no está escondido, no está. */
  for (const clave of [
    'idx', 'enfermedad_actual', 'general', 'cardiopulmonar',
    'recipe', 'indicaciones', 'tratamiento_aplicado', 'hora_fin', 'ta',
  ]) {
    await expect(page.locator(`#c-${clave}`), clave).toHaveCount(0);
  }

  /* Y tampoco el botón de cerrar: recepción abre, no firma. */
  await expect(page.getByRole('button', { name: /cerrar/i })).toHaveCount(0);
});

test('recepción admite y el caso queda a nombre del médico', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await admitir(page, DE_RECEPCION, CUENTAS.medico.nombre);

  const caso = await atencionDe(DE_RECEPCION);
  const recepcion = await idDe(CUENTAS.recepcionista.correo);
  const medico = await idDe(CUENTAS.medico.correo);

  expect(caso.estado).toBe('borrador');
  expect(caso.medico_id).toBe(medico);
  expect(caso.abierta_por).toBe(recepcion);
  expect(caso.datos.motivo).toBe(DEL_MESON.motivo);
  /* El nombre del médico queda en los datos: es lo que sale impreso. */
  expect(caso.datos.medico).toBe(CUENTAS.medico.nombre);
  /* Y la fecha es la de hoy en Caracas, no la del reloj del servidor. */
  expect(caso.datos.fecha).toBe(hoyEnCaracas());
});

test('el médico lo ve esperando al entrar y lo abre con los datos puestos', async ({ page }) => {
  await entrar(page, 'medico');

  const aviso = page.locator('.espera');
  await expect(aviso).toContainText('esperando');
  await expect(aviso).toContainText(NOMBRE[DE_RECEPCION]);
  await expect(aviso).toContainText(DEL_MESON.motivo);

  await aviso.locator('a', { hasText: NOMBRE[DE_RECEPCION] }).click();
  await expect(page).toHaveURL(/\/editar$/);

  /* Lo que preguntó recepción ya está escrito. */
  await expect(page.locator('#c-nombre')).toHaveValue(NOMBRE[DE_RECEPCION]);
  await expect(page.locator('#c-edad')).toHaveValue(DEL_MESON.edad);
  await expect(page.locator('#c-motivo')).toHaveValue(DEL_MESON.motivo);
});

test('otro médico puede tomar el caso que recepción puso a nombre del primero', async ({ page }) => {
  await entrar(page, 'recepcionista');
  await admitir(page, PARA_OTRO, CUENTAS.medico.nombre);
  await salir(page);

  await entrar(page, 'medico2');
  const fila = page.locator('.espera a', { hasText: NOMBRE[PARA_OTRO] }).first();
  await expect(fila).toContainText('de otro médico');
  await fila.click();

  /* No es suyo, así que no entra a escribirlo: entra al caso y ahí decide. */
  await expect(page).toHaveURL(/\/sistema\/atencion\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Tomar el caso' }).click();
  await expect(page).toHaveURL(/\/editar$/);

  const caso = await atencionDe(PARA_OTRO);
  expect(caso.medico_id).toBe(await idDe(CUENTAS.medico2.correo));
  /* El nombre impreso cambia con el dueño: si no, el documento dice que lo
     atendió uno y la firma es de otro. */
  expect(caso.datos.medico).toBe(CUENTAS.medico2.nombre);
});

test('un diagnóstico mandado a mano en el cuerpo del formulario no se guarda', async ({ page }) => {
  await entrar(page, 'recepcionista');
  const medico = await idDe(CUENTAS.medico.correo);

  /* El permiso no puede depender de que la pantalla no dibuje el campo: lo
     que se prueba es el filtro del servidor. */
  const r = await page.request.post(
    `/sistema/atencion/abrir?cedula=${encodeURIComponent(POR_EL_CUERPO)}`,
    {
      /* El guardia de origen pide la cabecera que pone el navegador; sin
         ella contesta 403 y la prueba no llegaría a comprobar el filtro de
         campos, que es lo que vino a ver. */
      headers: { origin: 'http://localhost:4399' },
      form: {
        tipo_doc: 'cedula',
        cedula: POR_EL_CUERPO,
        nombre: NOMBRE[POR_EL_CUERPO],
        edad: '50',
        sexo: 'Masculino',
        lugar: 'En el local',
        fecha: hoyEnCaracas(),
        hora_inicio: '09:15',
        motivo: 'Control',
        medico_id: medico,
        /* Lo que recepción no tiene permiso de escribir. */
        idx: 'Infarto agudo de miocardio',
        idx_codigo: 'I219',
        enfermedad_actual: 'Escrito por quien no debe',
        recipe: 'Aspirina 100 mg',
        hora_fin: '09:40',
      },
    },
  );
  expect(r.status()).toBeLessThan(400);

  const caso = await atencionDe(POR_EL_CUERPO);
  expect(caso.estado).toBe('borrador');
  expect(caso.datos.motivo).toBe('Control');
  for (const clave of ['idx', 'idx_codigo', 'enfermedad_actual', 'recipe', 'hora_fin']) {
    expect(caso.datos[clave], clave).toBeUndefined();
  }
});

test('en cuanto el médico escribe algo, el caso sale de la sala de espera', async ({ page }) => {
  await entrar(page, 'medico');
  const caso = await atencionDe(DE_RECEPCION);

  await page.goto(`/sistema/atencion/${caso.id}/editar`);
  await llenar(page, { enfermedad_actual: 'Refiere fiebre de 38,5 °C desde anoche.' });
  await page.getByRole('button', { name: /Guardar y salir/ }).click();
  await expect(page).toHaveURL(/\/sistema\/atencion\/[0-9a-f-]{36}$/);

  await page.goto('/sistema');
  const aviso = page.locator('.espera');
  if (await aviso.count()) {
    await expect(aviso).not.toContainText(NOMBRE[DE_RECEPCION]);
  }

  /* Sigue en los borradores, que es donde le toca, y ya sin la chapa. */
  await page.goto('/sistema/borradores');
  const fila = page.locator('.pend li', { hasText: NOMBRE[DE_RECEPCION] }).first();
  await expect(fila).toBeVisible();
  await expect(fila.locator('.pend__chapa')).toHaveCount(0);
});
