-- Recepción abre el caso, el médico lo escribe.
--
-- Hasta acá una atención general nacía siempre de la mano del médico. En el
-- mesón hay una persona que ya le preguntó al paciente su nombre, su cédula,
-- su edad, quién le cubre y qué le pasa; que el médico vuelva a preguntarlo
-- con el paciente sentado al frente es trabajo hecho dos veces.
--
-- `abierta_por` es quien hizo esa admisión. ADMITE NULOS a propósito: nulo
-- quiere decir «la abrió el propio médico», que es como venía funcionando y
-- como siguen naciendo las que él mismo empieza. Rellenar las filas viejas
-- con el médico de cada una sería escribir que recepción admitió casos que
-- nunca tocó.
--
-- El índice es parcial porque la pregunta que se le hace siempre es la misma
-- —«¿cuáles abrió recepción y el médico todavía no cerró?»— y las que tienen
-- la columna nula no son candidatas a esa respuesta.

alter table atencion
  add column if not exists abierta_por text references "user"(id);

create index if not exists atencion_abierta_por_idx
  on atencion (abierta_por)
  where abierta_por is not null;
