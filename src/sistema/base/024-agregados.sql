-- LO QUE SE LE AGREGA A UNA ATENCIÓN YA CERRADA
--
-- Una atención cerrada no se edita: es lo que se firmó y lo que se le
-- entregó al paciente. Pero el caso sigue vivo después del cierre —el
-- paciente vuelve con un examen, aparece un diagnóstico que no estaba,
-- hay que aclarar algo— y hasta ahora la única salida era anotarlo en
-- otra atención, separado de la que lo explica.
--
-- Esto es un agregado: se suma debajo de lo cerrado, con su fecha y su
-- autor, y lo de arriba no se toca. Lo escribe cualquier médico, no solo
-- el que atendió, porque el que ve al paciente la segunda vez puede ser
-- otro.
--
-- Tres clases:
--   nota         un texto: evolución, aclaración, indicación.
--   diagnostico  un diagnóstico más, del catálogo CIE-10 o escrito.
--   examenes     exámenes indicados, uno por línea. El médico los indica
--                y recepción registra la orden con su precio, como en la
--                consulta: el médico no toca cobros ni laboratorio.
--
-- NADA SE BORRA. Administración anula un agregado con motivo, igual que
-- se anula una atención: queda tachado, a la vista, y no sale en el
-- documento. Un registro clínico que desaparece sin rastro es justo lo
-- que pregunta una auditoría.

create table agregado (
  id              uuid primary key default gen_random_uuid(),
  atencion_id     uuid not null references atencion(id),
  tipo            text not null check (tipo in ('nota', 'diagnostico', 'examenes')),
  -- La nota, el nombre del diagnóstico o los exámenes uno por línea.
  texto           text not null check (btrim(texto) <> '' and length(texto) <= 4000),
  -- El código CIE-10 cuando el diagnóstico se eligió del catálogo.
  codigo          text,
  autor_id        text not null references "user"(id),
  creado          timestamptz not null default now(),
  -- Para los exámenes indicados: la orden con que recepción los registró.
  orden_id        uuid references atencion(id),
  anulado_por     text references "user"(id),
  anulado_motivo  text,
  anulado_en      timestamptz,
  constraint agregado_anulacion_completa check (
    (anulado_por is null and anulado_motivo is null and anulado_en is null)
    or (anulado_por is not null and btrim(anulado_motivo) <> '' and anulado_en is not null)
  ),
  constraint agregado_codigo_solo_diagnostico check (codigo is null or tipo = 'diagnostico'),
  constraint agregado_orden_solo_examenes check (orden_id is null or tipo = 'examenes')
);

create index agregado_atencion_idx on agregado (atencion_id, creado);

-- Las indicaciones que recepción todavía no registró: la cola las busca.
create index agregado_pendiente_idx on agregado (creado)
  where tipo = 'examenes' and orden_id is null and anulado_por is null;

comment on table agregado is
  'Lo que se le suma a una atención cerrada: notas, diagnósticos y exámenes indicados. Se anula con motivo, no se borra.';
