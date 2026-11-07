/**
 * ¿Esta copia del sitio es la de revisión o la que ve la gente?
 *
 * Con PREVIA=1 se compila la copia interna: la que lleva noindex y la que
 * muestra los huecos —"falta el dato de…", "lo que falta responder"— para
 * que al revisarla salte a la vista qué le falta al sitio.
 *
 * En producción eso NO puede salir. Estuvo saliendo: cualquiera que abriera
 * la página del laboratorio leía "estas preguntas están esperando el dato
 * del cliente", y Google lo indexó. Alguien buscando una emergencia no
 * tiene por qué enterarse de cómo va el encargo, y el cliente tampoco tiene
 * por qué leer su propia lista de pendientes en su sitio publicado.
 */
export const enRevision = import.meta.env.PREVIA === '1';
