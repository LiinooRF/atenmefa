-- DERIVACIONES: INTERNAS, EXTERNAS Y TRASLADOS
--
-- La interconsulta (026) solo sabía de especialistas de afuera, contactados
-- por WhatsApp. Pero el paciente se deriva de tres maneras:
--
--   interna   a un especialista que trabaja en el centro y tiene cuenta en
--             el sistema. Le llega a su panel y lo atiende en una consulta
--             que queda colgada de la que lo derivó.
--   externa   a un especialista de afuera, del catálogo de especialistas:
--             lo que ya hacía la interconsulta.
--   traslado  a otro centro u hospital, con o sin ambulancia.
--
-- Y en cada una el médico decide si pasa por recepción —para admitir al
-- paciente, cobrar la consulta o coordinar la ambulancia— o va directa. Si
-- esa opción existe y qué viene marcado lo decide cada centro en sus
-- ajustes: un centro sin mesón la apaga.
--
-- La tabla sigue llamándose interconsulta: estaba vacía en las dos bases
-- cuando se amplió y renombrarla movía media aplicación sin cambiar nada.

alter table interconsulta
  add column tipo text not null default 'externa'
    check (tipo in ('interna', 'externa', 'traslado')),
  -- Interna: a qué médico del sistema.
  add column destino_medico_id text references "user"(id),
  -- Traslado: a dónde, y cómo.
  add column destino_centro text,
  add column ambulancia boolean,
  add column paramedico text,
  -- Si recepción la ve en su cola y la gestiona.
  add column por_recepcion boolean not null default false,
  -- Interna: la consulta en la que el especialista lo atendió.
  add column atencion_destino_id uuid references atencion(id);

-- El traslado no tiene especialidad: va a un lugar, no a un área.
alter table interconsulta alter column especialidad drop not null;
alter table interconsulta drop constraint if exists interconsulta_especialidad_check;
alter table interconsulta drop constraint if exists interconsulta_contacto_completo;

alter table interconsulta add constraint derivacion_completa check (
  (tipo = 'externa' and btrim(coalesce(especialidad, '')) <> '')
  or (tipo = 'interna' and destino_medico_id is not null)
  or (tipo = 'traslado' and btrim(coalesce(destino_centro, '')) <> '')
);

-- Una externa contactada sabe a quién se le escribió.
alter table interconsulta add constraint derivacion_contacto_completo check (
  tipo <> 'externa' or estado in ('pendiente', 'anulada')
  or (especialista_id is not null and contactada_por is not null and contactada is not null)
);

create index derivacion_destino_idx on interconsulta (destino_medico_id)
  where estado in ('pendiente', 'contactada');

-- La especialidad del médico, para poder derivarle. Sin ella no aparece en
-- la lista de especialistas del centro.
alter table "user" add column if not exists especialidad text;

-- AJUSTES DEL CENTRO
--
-- Lo que cambia de un centro a otro y no se decide en el código. Sin fila,
-- vale lo de fábrica (ver lib/ajustes.ts).
create table ajuste (
  clave         text primary key,
  valor         text not null,
  cambiado_por  text not null references "user"(id),
  cambiado      timestamptz not null default now()
);

comment on table ajuste is
  'Configuración del centro que cambia administración: si las derivaciones pasan por recepción, qué viene marcado.';
