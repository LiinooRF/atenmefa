/**
 * Búsqueda de diagnósticos en la CIE-10.
 *
 * El catálogo tiene doce mil rúbricas y pesa cerca de un mega: mandarlo al
 * navegador para buscar ahí sería cobrarle un mega de datos a una tablet
 * con plan prepago cada vez que se abre una consulta. Se busca en el
 * servidor y vuelven veinticinco.
 *
 *   GET /sistema/api/diagnosticos?q=infeccion%20urinaria
 *
 * Sin `q` devuelve la cabeza de la lista, que es lo que el campo muestra al
 * abrirse: lo que administración marcó y lo que el centro ya usa.
 */
import type { APIRoute } from 'astro';
import { exigirEnApi } from '../../../sistema/lib/guardia';
import { buscar } from '../../../sistema/lib/diagnosticos';
import { comoSeLee } from '../../../sistema/cie10';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  /* Quien escribe una historia y quien la lee: el campo vive en el
     formulario, pero la pantalla de administración busca en el mismo
     catálogo para elegir los frecuentes. */
  const corte = exigirEnApi(ctx, 'ver_historia');
  if (corte) return corte;

  const q = (ctx.url.searchParams.get('q') ?? '').slice(0, 120);
  const encontrados = await buscar(q);

  return Response.json(
    {
      q,
      /* Se manda el nombre ya legible y también el oficial: la pantalla
         muestra el primero y lo que se guarda en el expediente es el
         segundo, que es el del catálogo. */
      diagnosticos: encontrados.map((d) => ({
        codigo: d.codigo,
        nombre: comoSeLee(d.nombre),
        oficial: d.nombre,
        sexo: d.sexo,
        frecuente: d.frecuente,
        usos: d.usos,
      })),
    },
    /* No se cachea: la lista cambia cuando administración marca algo o
       cuando el centro usa un código nuevo, y una lista de diagnósticos
       vieja en la pantalla del médico no se nota. */
    { headers: { 'Cache-Control': 'no-store' } },
  );
};
