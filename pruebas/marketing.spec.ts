/**
 * Medición del sitio público y la pantalla que la muestra.
 *
 * Son dos cosas en un archivo porque no se pueden probar aparte: la
 * pantalla no tiene nada que mostrar si antes no entró nadie al sitio, y el
 * registro no se puede dar por bueno hasta que el número aparece donde el
 * cliente lo va a mirar.
 *
 * La prueba que más importa es la última. Lo que se prometió no es "medimos
 * el tráfico" sino "medimos el tráfico sin guardar la IP de nadie y sin
 * dejar nada en el equipo de quien entra", y eso es una promesa que se
 * comprueba contra la base, no leyendo el código.
 *
 * TRAMPA DEL ENTORNO, no del sistema: el navegador que levanta Playwright
 * se presenta como «HeadlessChrome», que el filtro de rastreadores
 * reconoce y descarta con toda la razón. Con el agente por omisión no se
 * registra una sola visita y parece que la medición estuviera rota. De ahí
 * el test.use de abajo.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  entrar, ahoraEnLaBase, conBase,
  AGENTE_TELEFONO, AGENTE_COMPUTADORA, AGENTE_RASTREADOR,
  visitasDesde, eventosDesde, columnasDe, borrarMediciones, anchos,
} from './apoyo';

test.use({ userAgent: AGENTE_TELEFONO });

const HOY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const haceDias = (n: number) => {
  const d = new Date(`${HOY}T12:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/** Dónde arrancó el archivo. Todo lo que se borra al final sale de acá. */
let inicio: Date;

/** El recuadro de las cifras del período que lleva ese rótulo. */
const recuadro = (page: Page, rotulo: string) =>
  page.locator('.cifras li')
    .filter({ has: page.locator('.cifras__rotulo', { hasText: new RegExp(`^${rotulo}$`) }) });

/**
 * Un aviso a /api/v como lo manda la página: con el Origin del sitio, que
 * es lo que el middleware compara, y con un agente declarado.
 *
 * El origen sale de la configuración y no escrito a mano acá: repetirlo
 * dejaría la prueba desfasada el día que cambie el puerto.
 */
function avisar(
  page: Page,
  cuerpo: Record<string, string>,
  agente: string = AGENTE_TELEFONO,
) {
  const origen = new URL(test.info().project.use.baseURL as string).origin;
  return page.request.post('/api/v', {
    headers: { origin: origen, 'user-agent': agente },
    data: cuerpo,
  });
}

/** Espera a que la medición haya llegado a la base. */
async function esperarVisitas(desde: Date, ruta: string, cuantas: number) {
  await expect
    .poll(async () => (await visitasDesde(desde, ruta)).length,
      { timeout: 10_000, message: `${ruta} no quedó registrada` })
    .toBe(cuantas);
}

test.beforeAll(async ({ browser }) => {
  inicio = await ahoraEnLaBase();

  /* Una visita de arranque. Sin ella la pantalla contesta "todavía no entró
     nadie", que es un mensaje distinto del de "en estas fechas no hubo
     nadie", y la prueba del período vacío no podría distinguirlos. */
  const contexto = await browser.newContext({ userAgent: AGENTE_TELEFONO });
  const page = await contexto.newPage();
  await page.goto('/');
  await esperarVisitas(inicio, '/', 1);
  await contexto.close();
});

test.afterAll(async () => {
  await borrarMediciones(inicio);
});

test('el médico no puede abrir marketing', async ({ page }) => {
  await entrar(page, 'medico');
  await page.goto('/sistema/marketing');
  await expect(page).toHaveURL(/\/sistema\/sin-permiso/);
  await expect(page.locator('body')).toContainText('métricas del sitio');
});

test('visitar el sitio público sube el contador de visitas del día', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/marketing?d=${HOY}|${HOY}`);
  const antes = Number(await recuadro(page, 'Visitas').locator('.cifras__dato').innerText());

  const marca = await ahoraEnLaBase();
  await page.goto('/');
  await page.goto('/servicios/laboratorio-clinico');
  await esperarVisitas(marca, '/servicios/laboratorio-clinico', 1);

  const [laboratorio] = await visitasDesde(marca, '/servicios/laboratorio-clinico');
  expect(laboratorio.dia, 'la visita no cayó en el día de hoy en Caracas').toBe(HOY);
  // El agente declarado es de un teléfono y así tiene que quedar clasificado.
  expect(laboratorio.dispositivo).toBe('movil');
  expect(laboratorio.navegador).toBe('Chrome');

  /* Abrir la página de un servicio deja además el evento, y el detalle lo
     pone el servidor desde nuestra propia ruta. */
  const servicios = await eventosDesde(marca, 'ver_servicio');
  expect(servicios.map((e) => e.detalle)).toContain('laboratorio-clinico');

  await page.goto(`/sistema/marketing?d=${HOY}|${HOY}`);
  const despues = Number(await recuadro(page, 'Visitas').locator('.cifras__dato').innerText());
  expect(despues).toBeGreaterThanOrEqual(antes + 2);
});

test('el panel y los archivos de _astro no se cuentan como visita', async ({ page }) => {
  const pedidos: string[] = [];
  page.on('request', (p) => pedidos.push(new URL(p.url()).pathname));

  const marca = await ahoraEnLaBase();
  await entrar(page, 'administracion');
  await page.goto('/sistema/pacientes');
  await page.goto('/sistema/marketing');

  /* La página pública va al final: cuando su visita aparece en la base, lo
     que se pidió antes ya pasó por el servidor. Así la ausencia se puede
     afirmar sin esperar un tiempo fijo. */
  await page.goto('/servicios/consulta-medica');
  await esperarVisitas(marca, '/servicios/consulta-medica', 1);

  // Si el navegador no pidió los archivos del sitio, la prueba no prueba nada.
  expect(pedidos.some((p) => p.startsWith('/_astro/')),
    'el navegador no pidió ningún archivo de _astro').toBe(true);

  const rutas = (await visitasDesde(marca)).map((v) => v.ruta);
  expect(rutas.filter((r) => r.startsWith('/sistema'))).toEqual([]);
  expect(rutas.filter((r) => r.startsWith('/_astro'))).toEqual([]);
  expect(rutas.filter((r) => /\.[a-z0-9]{1,8}$/i.test(r))).toEqual([]);
});

test('un user-agent de rastreador no se cuenta', async ({ page, browser }) => {
  const marca = await ahoraEnLaBase();

  const contexto = await browser.newContext({ userAgent: AGENTE_RASTREADOR });
  const rastreador = await contexto.newPage();
  await rastreador.goto('/');
  await rastreador.goto('/servicios/emergencias');
  await contexto.close();

  // Una persona después, para saber cuándo dejar de esperar.
  await page.goto('/servicios/nebulizacion');
  await esperarVisitas(marca, '/servicios/nebulizacion', 1);

  expect(await visitasDesde(marca, '/servicios/emergencias'),
    'el rastreador quedó contado como visita').toEqual([]);
  /* Tampoco el evento que el servidor escribe solo al abrir un servicio:
     el corte está antes, en el agente, y no en la ruta. */
  const servicios = await eventosDesde(marca, 'ver_servicio');
  expect(servicios.map((e) => e.detalle)).toEqual(['nebulizacion']);
});

test('un evento mandado a /api/v queda registrado y aparece en la pantalla', async ({ page }) => {
  const marca = await ahoraEnLaBase();

  await page.goto('/');
  await esperarVisitas(marca, '/', 1);
  const [visita] = await visitasDesde(marca, '/');

  const respuesta = await avisar(page, { tipo: 'llamar', ruta: '/' });
  // Responde sin cuerpo: el navegador no escucha la respuesta de un beacon.
  expect(respuesta.status()).toBe(204);

  await expect
    .poll(async () => (await eventosDesde(marca, 'llamar')).length, { timeout: 10_000 })
    .toBe(1);

  const [llamada] = await eventosDesde(marca, 'llamar');
  expect(llamada.ruta).toBe('/');
  /* Misma huella que su visita: sin eso la conversión no podría cruzar
     quién entró con quién hizo algo. */
  expect(llamada.huella).toBe(visita.huella);

  await entrar(page, 'administracion');
  await page.goto(`/sistema/marketing?d=${HOY}|${HOY}`);

  const telefono = page.locator('.acciones__lista li', { hasText: 'el teléfono para llamar' });
  await expect(telefono).toBeVisible();
  expect(Number(await telefono.locator('.acciones__dato').innerText())).toBeGreaterThanOrEqual(1);
  await expect(telefono.locator('.acciones__veces')).toContainText(/ve(z|ces) en total/);

  // Y el porcentaje de contacto deja de ser cero.
  const contacto = recuadro(page, 'Nos contactaron');
  expect(Number((await contacto.locator('.cifras__dato').innerText()).replace(/[^\d,]/g, '').replace(',', '.')))
    .toBeGreaterThan(0);
});

test('el clic en un teléfono del sitio público queda registrado', async ({ page }) => {
  const marca = await ahoraEnLaBase();
  await page.goto('/servicios/electrocardiograma');
  await esperarVisitas(marca, '/servicios/electrocardiograma', 1);

  /* Se le pone un oyente propio que detiene la navegación: el del medidor
     va en captura y corre antes, así que el aviso sale igual, pero el
     navegador no intenta abrir el marcador del teléfono, que en una
     máquina sin aplicación de llamadas deja la prueba colgada. */
  await page.evaluate(() => {
    const enlace = document.querySelector<HTMLAnchorElement>('a[href^="tel:"]');
    if (!enlace) throw new Error('la página no tiene ningún enlace de llamada');
    enlace.addEventListener('click', (ev) => ev.preventDefault());
    enlace.click();
  });

  await expect
    .poll(async () => (await eventosDesde(marca, 'llamar')).length, { timeout: 10_000 })
    .toBe(1);
  const [llamada] = await eventosDesde(marca, 'llamar');
  expect(llamada.ruta).toBe('/servicios/electrocardiograma');
});

test('/api/v rechaza un POST con Origin de otro sitio', async ({ page }) => {
  const marca = await ahoraEnLaBase();
  await page.goto('/');

  const ajeno = await page.request.post('/api/v', {
    headers: { origin: 'https://sitio-ajeno.example', 'user-agent': AGENTE_TELEFONO },
    data: { tipo: 'vista', ruta: '/robada-por-otro-sitio' },
  });
  expect(ajeno.status()).toBe(403);
  expect(await ajeno.text()).toContain('Origen no permitido');

  /* Sin Origin ni Referer también se rechaza: un aviso de verdad siempre
     manda al menos uno de los dos. */
  const anonimo = await page.request.post('/api/v', {
    headers: { 'user-agent': AGENTE_TELEFONO },
    data: { tipo: 'vista', ruta: '/robada-sin-origen' },
  });
  expect(anonimo.status()).toBe(403);

  /* Pero el segundo nombre del propio sistema sí entra: ORIGENES_EXTRA
     lleva los demás dominios por los que se llega al mismo lugar. El día
     que se agregó el dominio del centro, entrar por él devolvía «Origen
     no permitido» y parecía que la clave estaba mal.
     
     Esa variable trae a propósito un nombre mal escrito al lado: uno roto
     no puede dejar afuera a los que sí sirven. */
  const elOtroNombre = await page.request.post('/api/v', {
    headers: { origin: 'https://otro-nombre.example', 'user-agent': AGENTE_TELEFONO },
    data: { tipo: 'vista', ruta: '/por-el-otro-nombre' },
  });
  expect(elOtroNombre.status()).toBe(204);

  // Uno bueno al final, para poder afirmar que los otros dos no escribieron.
  expect((await avisar(page, { tipo: 'vista', ruta: '/testigo-del-origen' })).status()).toBe(204);
  await esperarVisitas(marca, '/testigo-del-origen', 1);

  expect(await visitasDesde(marca, '/robada-por-otro-sitio')).toEqual([]);
  expect(await visitasDesde(marca, '/robada-sin-origen')).toEqual([]);
});

test('un período sin visitas lo dice en vez de mostrar gráficos vacíos', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto('/sistema/marketing?d=2019-01-01|2019-01-07');

  await expect(page.locator('.nada')).toContainText('Ninguna visita en este período');
  // Y distingue no haber tenido visitas de no haber estado midiendo.
  await expect(page.locator('.nada')).toContainText('anteriores a la medición');

  await expect(page.locator('.rejilla')).toHaveCount(0);
  await expect(page.locator('.cifras')).toHaveCount(0);
  await expect(page.locator('.acciones')).toHaveCount(0);

  // La nota de privacidad queda a la vista incluso sin un solo dato.
  await expect(page.locator('.aviso')).toContainText('no usa cookies');
});

test('la medición no guarda ninguna IP y la huella no la contiene', async ({ page }) => {
  /* Solo las dos tablas de la medición del sitio público. La bitácora
     clínica es otra decisión y tiene su propia columna de IP, que hoy nadie
     escribe: lo que se prometió acá es que el tráfico del sitio se mide sin
     guardar la dirección de nadie. */
  const deVisita = await columnasDe('visita');
  const deEvento = await columnasDe('evento');

  expect(deVisita).toEqual([
    'id', 'momento', 'ruta', 'referente', 'dispositivo', 'navegador', 'pais', 'huella',
  ]);
  expect(deEvento).toEqual(['id', 'momento', 'tipo', 'detalle', 'ruta', 'huella']);

  for (const columna of [...deVisita, ...deEvento]) {
    expect.soft(columna, `la columna «${columna}» huele a dirección de red`)
      .not.toMatch(/^ip$|_ip|ip_|address|cliente|remoto/i);
  }

  /* Ninguna columna puede ser de un tipo de red, aunque se llamara de otra
     manera: inet y cidr existen justamente para guardar direcciones. */
  const deRed = await conBase(async (sql) => {
    const filas = await sql`
      SELECT table_name, column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('visita', 'evento')
         AND data_type IN ('inet', 'cidr', 'macaddr')`;
    return filas.map((f) => `${f.table_name}.${f.column_name}`);
  });
  expect(deRed).toEqual([]);

  // Y ningún valor guardado tiene forma de dirección, caiga en la columna que caiga.
  const conPintaDeIp = await conBase(async (sql) => {
    const forma = '[0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}';
    const [fila] = await sql`
      SELECT (
        (SELECT count(*) FROM visita
          WHERE ruta ~ ${forma} OR coalesce(referente, '') ~ ${forma}
             OR coalesce(navegador, '') ~ ${forma} OR huella ~ ${forma})
        + (SELECT count(*) FROM evento
            WHERE ruta ~ ${forma} OR coalesce(detalle, '') ~ ${forma} OR huella ~ ${forma})
      )::int AS cuantas`;
    return Number(fila.cuantas);
  });
  expect(conPintaDeIp, 'hay valores guardados con forma de dirección IP').toBe(0);

  /* Tres avisos del mismo cliente: los dos primeros con el mismo equipo y
     el tercero diciendo que es otro. Si la huella fuera la IP —o saliera
     solo de ella— los tres darían igual. */
  const marca = await ahoraEnLaBase();
  await page.goto('/');
  await avisar(page, { tipo: 'vista', ruta: '/huella-uno' }, AGENTE_TELEFONO);
  await avisar(page, { tipo: 'vista', ruta: '/huella-dos' }, AGENTE_TELEFONO);
  await avisar(page, { tipo: 'vista', ruta: '/huella-tres' }, AGENTE_COMPUTADORA);
  await esperarVisitas(marca, '/huella-tres', 1);

  const [uno] = await visitasDesde(marca, '/huella-uno');
  const [dos] = await visitasDesde(marca, '/huella-dos');
  const [tres] = await visitasDesde(marca, '/huella-tres');

  expect(uno.huella, 'dos visitas del mismo cliente tendrían que compartir huella')
    .toBe(dos.huella);
  expect(tres.huella, 'cambiar de equipo tendría que dar otra huella')
    .not.toBe(uno.huella);

  for (const visita of [uno, dos, tres]) {
    // Treinta y dos dígitos hexadecimales: ahí no cabe una dirección.
    expect(visita.huella).toMatch(/^[0-9a-f]{32}$/);
    for (const direccion of ['127.0.0.1', '0:0:0:0', '::1', 'localhost']) {
      expect(visita.huella).not.toContain(direccion);
    }
  }
});

test('el navegador no deja cookies ni nada guardado en el equipo', async ({ page, context }) => {
  await page.goto('/');
  await page.goto('/servicios/cirugia-menor');

  expect(await context.cookies(), 'el sitio público dejó cookies').toEqual([]);

  const guardado = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    sesion: Object.keys(sessionStorage),
  }));
  expect(guardado.local).toEqual([]);
  expect(guardado.sesion).toEqual([]);
});

test('marketing no desborda a 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page, 'administracion');

  const pantallas = [
    `/sistema/marketing?d=${HOY}|${HOY}`,
    '/sistema/marketing',
    '/sistema/marketing?d=2019-01-01|2019-01-07',
  ];

  for (const pantalla of pantallas) {
    await page.goto(pantalla);
    /* Un píxel de tolerancia: el redondeo de un borde a mitad de píxel no
       es un desborde, y se nota igual si algo se sale de verdad. */
    const medida = await anchos(page);
    expect
      .soft(medida.documento, `${pantalla} mide ${medida.documento} en ${medida.ventana}`)
      .toBeLessThanOrEqual(medida.ventana + 1);
  }
});

test('los gráficos llevan un solo tono', async ({ page }) => {
  await entrar(page, 'administracion');
  await page.goto(`/sistema/marketing?d=${haceDias(6)}|${HOY}`);

  /* Los gráficos son de una sola medida: el largo de la barra informa y el
     color no codifica nada. Si alguien le pone una paleta por categoría,
     acá aparecen varios tonos donde tendría que haber uno.
     Las barras en cero quedan afuera porque no se pintan: no son otro
     color, son nada. */
  const tonos = await page
    .locator('.barras__barra:not([data-cero]), .dias__barra:not([data-cero])')
    .evaluateAll((barras) =>
      [...new Set(barras.map((b) => getComputedStyle(b).backgroundColor))]);

  expect(tonos.length, `las barras usan ${tonos.length} tonos: ${tonos.join(', ')}`).toBe(1);
});
