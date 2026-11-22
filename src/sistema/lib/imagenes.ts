/**
 * Quitar el fondo blanco de una imagen, para el sello.
 *
 * «El fondo blanco se elimina para que se vea como un sello estampado» —
 * el truco de informemedico.pages.dev, pero local: corre en el servidor al
 * cargar, no en la nube de nadie.
 *
 * El umbral NO es blanco puro: una foto del sello trae papel casi blanco
 * (250, 248…) y un relleno con sombra. Todo lo que se acerque al blanco
 * se vuelve transparente, suavizando el borde con el canal alfa para que
 * no quede sierra. La tinta del sello (azul, roja, negra) no se toca.
 */
export const TOPE_SELLO = 240 * 1024;

export interface ImagenProcesada { uri: string; ancho: number; alto: number }

export async function quitarFondoBlanco(archivo: File): Promise<ImagenProcesada> {
  if (archivo.type !== 'image/png' && archivo.type !== 'image/jpeg') {
    throw new Error('El sello tiene que ser una imagen PNG o JPG.');
  }

  /* sharp viene con el panel de Dokploy vía node_modules; si algún día se
     quita, esta pantalla avisa en vez de colgar la carga. */
  let sharp: (typeof import('sharp'))['default'];
  try {
    sharp = ((await import('sharp')) as unknown as { default: (typeof import('sharp'))['default'] }).default;
  } catch {
    throw new Error('No se pudo procesar la imagen en este servidor. Avise a soporte.');
  }

  const IMAGEN = 420;          // lado mayor, en px: sobra para imprimir a 2 cm
  const UMBRAL = 232;          // 255-23: lo que brilla más que esto es papel
  const SUAVE = 26;            // ancho de la franja de difuminado del borde

  let base = sharp(archivo instanceof Buffer ? archivo : Buffer.from(await archivo.arrayBuffer()))
    .resize({ width: IMAGEN, height: IMAGEN, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha();

  const { data, info } = await base.raw().toBuffer({ resolveWithObject: true });
  const { width: ancho, height: alto, channels: canales } = info;
  for (let i = 0; i < data.length; i += canales) {
    // Luminancia mínima de los tres canales: un sello rojo en papel blanco
    // tiene canales G y B altísimos; con el mínimo se detecta el papel y no
    // la tinta.
    const oscuro = Math.min(data[i], data[i + 1], data[i + 2]);
    if (oscuro >= UMBRAL + SUAVE) {
      data[i + 3] = 0;                                     // papel: transparente
    } else if (oscuro > UMBRAL) {
      // Franja de borde: transparencia proporcional, sin escalones.
      data[i + 3] = Math.round(255 * (UMBRAL + SUAVE - oscuro) / SUAVE);
    }
  }
  const png: Buffer = await sharp(data, { raw: { width: ancho, height: alto, channels: canales } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const uri = 'data:image/png;base64,' + png.toString('base64');
  return { uri, ancho, alto };
}
