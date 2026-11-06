/**
 * Lectura de variables de entorno que funciona en los dos contextos:
 * dentro de Astro (import.meta.env) y en scripts sueltos de Node
 * (process.env). Sin esto, los scripts de mantenimiento revientan.
 */
export function entorno(clave: string): string | undefined {
  const meta = (import.meta as unknown as { env?: Record<string, string> }).env;
  return meta?.[clave] ?? process.env[clave];
}

export function exigido(clave: string, ejemplo: string): string {
  const valor = entorno(clave);
  if (!valor) throw new Error(`Falta ${clave}. Ejemplo: ${ejemplo}`);
  return valor;
}
