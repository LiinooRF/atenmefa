import { defineConfig } from '@playwright/test';

/**
 * Pruebas de extremo a extremo contra el sistema interno.
 * Levanta el servidor construido, no el de desarrollo: se prueba lo que
 * se despliega.
 */
export default defineConfig({
  testDir: './pruebas',
  fullyParallel: false,          // comparten la misma base
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 45_000,
  use: {
    baseURL: 'http://localhost:4399',
    trace: 'retain-on-failure',
    locale: 'es-VE',
    timezoneId: 'America/Caracas',
  },
  webServer: {
    command: 'node dist/server/entry.mjs',
    url: 'http://localhost:4399/sistema/entrar',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: '4399',
      URL_BASE: 'http://localhost:4399',
      /* Nada de salir a internet durante las pruebas. Sin esto, con la base
         recién creada cada pantalla que muestra plata le iba a pedir la tasa
         del día al BCV, y la suite quedaba a merced de que ese servicio
         estuviera vivo. Las tasas que hacen falta se siembran. */
      SIN_RED: '1',
    },
  },
});
