/**
 * Prefija las rutas absolutas con la base del despliegue.
 *
 * En el servidor definitivo el sitio vive en la raíz y esto no hace nada.
 * En la vista previa de GitHub Pages vive bajo /<repo>/, y sin esto el logo,
 * el favicon y los enlaces del menú apuntarían a la raíz del dominio y darían 404.
 */
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export const ruta = (destino: string) => `${base}${destino}`;
