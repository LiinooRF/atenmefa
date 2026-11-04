/**
 * Servidor estático de dist/, atado a la interfaz de Tailscale.
 * Pensado para mostrar el avance dentro del tailnet, no para producción.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const RAIZ = new URL('../dist/', import.meta.url).pathname;
const PUERTO = Number(process.env.PUERTO ?? 8090);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

createServer(async (pedido, respuesta) => {
  try {
    let ruta = decodeURIComponent(new URL(pedido.url, 'http://x').pathname);
    if (ruta.endsWith('/')) ruta += 'index.html';
    const archivo = join(RAIZ, normalize(ruta).replace(/^(\.\.[/\\])+/, ''));

    let destino = archivo;
    try {
      if ((await stat(destino)).isDirectory()) destino = join(destino, 'index.html');
    } catch {
      destino = `${archivo}.html`;
    }

    const cuerpo = await readFile(destino);
    respuesta.writeHead(200, {
      'content-type': TIPOS[extname(destino)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    respuesta.end(cuerpo);
  } catch {
    respuesta.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    respuesta.end('No encontrado');
  }
}).listen(PUERTO, '0.0.0.0', () => {
  console.log(`Sirviendo dist/ en el puerto ${PUERTO}`);
});
