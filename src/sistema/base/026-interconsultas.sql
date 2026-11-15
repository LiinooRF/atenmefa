-- INTERCONSULTAS
--
-- El médico de guardia ve al paciente y encuentra algo que no le toca: un
-- problema en el ojo es de oftalmología, un riñón malo es de nefrología.
-- Hasta ahora lo escribía en «Referido a» y administración tenía que buscar
-- en una libreta a quién llamar, cuánto cobra y cuál es su número.
--
-- Ahora el médico pide la interconsulta eligiendo la especialidad, y
-- administración la ve en una lista con los especialistas de esa área, su
-- precio y un botón que abre WhatsApp con el mensaje ya escrito. Queda
-- anotado a quién se le escribió y cuándo.
--
-- Los especialistas los carga administración: ninguno viene precargado,
-- porque los nombres, los números y los precios son del centro y la lista
-- vieja que tiene el cliente ya no sirve.

create table especialista (
  id            uuid primary key default gen_random_uuid(),
  especialidad  text not null check (btrim(especialidad) <> ''),
  -- Sin tildes ni mayúsculas, para agrupar «Oftalmología» y «oftalmologia».
  especialidad_busca text not null,
  nombre        text not null check (btrim(nombre) <> ''),
  -- Como lo deja paraWhatsApp: 58 y diez dígitos.
  whatsapp      text,
  -- Lo que cobra la consulta. Es una consulta aparte y suele ser más cara.
  precio        numeric(14, 2) check (precio is null or precio >= 0),
  moneda        text not null default 'USD',
  notas         text,
  activo        boolean not null default true,
  creado        timestamptz not null default now()
);

create index especialista_especialidad_idx on especialista (especialidad_busca) where activo;

comment on table especialista is
  'Los especialistas a quienes se les manda una interconsulta, con su precio y su WhatsApp. Los carga administración.';

create table interconsulta (
  id                uuid primary key default gen_random_uuid(),
  atencion_id       uuid not null references atencion(id),
  especialidad      text not null check (btrim(especialidad) <> ''),
  especialidad_busca text not null,
  -- Para qué: lo que el especialista tiene que mirar.
  motivo            text not null default '' check (length(motivo) <= 2000),
  pedida_por        text not null references "user"(id),
  pedida            timestamptz not null default now(),
  -- pendiente → contactada → atendida. Se anula con motivo, no se borra.
  estado            text not null default 'pendiente'
                      check (estado in ('pendiente', 'contactada', 'atendida', 'anulada')),
  especialista_id   uuid references especialista(id),
  contactada_por    text references "user"(id),
  contactada        timestamptz,
  atendida          timestamptz,
  anulada_por       text references "user"(id),
  anulada_motivo    text,
  constraint interconsulta_contacto_completo check (
    estado in ('pendiente', 'anulada')
    or (especialista_id is not null and contactada_por is not null and contactada is not null)
  ),
  constraint interconsulta_anulacion_completa check (
    estado <> 'anulada' or (anulada_por is not null and btrim(anulada_motivo) <> '')
  )
);

create index interconsulta_atencion_idx on interconsulta (atencion_id);
create index interconsulta_abierta_idx on interconsulta (pedida) where estado in ('pendiente', 'contactada');

comment on table interconsulta is
  'Lo que el médico deriva a un especialista. Administración la contacta por WhatsApp y la da por atendida.';
