-- Corregir una atención ya cerrada, dejando el rastro.
--
-- «A veces se equivocan en la cédula… que quede en el mismo circuito de
-- atención para modificar esa consulta paso a paso y modificar la
-- información del paciente, dejando eso en el historial» (16-11).
--
-- Una atención cerrada está firmada. Corregirla la puede quien la firmó
-- —el médico su consulta, el bioanalista sus resultados— o administración,
-- siempre con motivo. Cada corrección guarda qué decía cada campo antes y
-- qué dice ahora; lo de antes no se pierde.

create table if not exists correccion (
  id               uuid primary key default gen_random_uuid(),
  atencion_id      uuid not null references atencion(id),
  autor_id         text not null references "user"(id),
  motivo           text not null check (length(btrim(motivo)) >= 5 and length(motivo) <= 2000),
  -- [{ "campo": "cedula", "rotulo": "Cédula", "antes": "…", "despues": "…" }]
  cambios          jsonb not null check (jsonb_typeof(cambios) = 'array' and jsonb_array_length(cambios) > 0),
  -- Si la cédula cambió y la atención pasó a otro paciente.
  paciente_antes   uuid references paciente(id),
  paciente_despues uuid references paciente(id),
  creado           timestamptz not null default now()
);

create index if not exists correccion_atencion_idx on correccion (atencion_id, creado);

comment on table correccion is
  'Correcciones de atenciones cerradas: quién, cuándo, por qué y cada campo antes y después. No se borran.';
