/**
 * Capturas de la página en móvil y escritorio.
 * Requiere `pnpm preview` corriendo en el puerto 4399.
 *
 * Las capturas de página completa se toman con movimiento reducido: las
 * animaciones por scroll dejan el contenido de más abajo en su estado inicial
 * y la captura saldría en blanco aunque la página esté bien.
 */
import { chromium } from 'playwright';

const salida = process.argv[2] ?? '.';
const navegador = await chromium.launch();

for (const [nombre, ancho, alto] of [
  ['movil', 390, 844],
  ['tableta', 768, 1024],
  ['escritorio', 1440, 900],
]) {
  const pagina = await navegador.newPage({
    viewport: { width: ancho, height: alto },
    reducedMotion: 'reduce',
  });
  await pagina.goto('http://localhost:4399/', { waitUntil: 'networkidle' });
  await pagina.screenshot({ path: `${salida}/${nombre}-completo.png`, fullPage: true });
  await pagina.screenshot({ path: `${salida}/${nombre}-plegado.png` });

  const anchoDoc = await pagina.evaluate(() => document.documentElement.scrollWidth);
  console.log(
    `${nombre.padEnd(11)} viewport ${ancho}  documento ${anchoDoc}  ${anchoDoc > ancho ? 'DESBORDA' : 'ok'}`,
  );
  await pagina.close();
}

await navegador.close();
