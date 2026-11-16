-- LOS PERFILES DEL BAREMO, CON SUS EXÁMENES ADENTRO
--
-- Desde 020 un perfil del baremo era un renglón con precio —«Perfil Lípido,
-- 8$»— y nada más: marcarlo en la orden no desplegaba ningún examen. Lo que
-- el cliente pidió desde el principio es otra cosa: «es como un combo…
-- pero se deben poder deseleccionar algún examen si lo quiero quitar».
--
-- Ahora un ítem del catálogo trae componentes. En la orden, al marcarlo se
-- despliegan sus exámenes, todos marcados, y se quita el que no va. Se
-- cobra el precio del ítem menos el precio suelto de lo quitado (si lo
-- quitado no se vende suelto, no descuenta nada). Al laboratorio le llegan
-- solo los exámenes que quedaron.
--
-- Los componentes salen de la HOJA del ítem: cada hoja del archivo del
-- laboratorio ya dice qué lleva («cada hoja hay un perfil definido»). Los
-- tres perfiles del baremo que no tenían hoja con su nombre se enlazan con
-- la que el cliente confirmó el 16-11-2026. El Perfil Covid 19 no tiene
-- hoja en el archivo: se arma a mano en Servicios cuando digan qué lleva.

create table servicio_componente (
  servicio_id    uuid not null references servicio(id) on delete cascade,
  componente_id  uuid not null references servicio(id) on delete cascade,
  orden          integer not null default 0,
  primary key (servicio_id, componente_id),
  check (servicio_id <> componente_id)
);

comment on table servicio_componente is
  'Los exámenes que trae un perfil del catálogo. En la orden se marcan todos y se puede quitar cualquiera.';

-- Qué componentes quedaron en este renglón. Null: no es un perfil.
alter table renglon add column if not exists incluye uuid[];

-- Los perfiles que no tenían hoja con su nombre, con la que confirmó el
-- cliente.
update servicio s set plantilla = m.hoja
from (values
  ('Perfil Hepático',   'TRANS-BIL-PROT'),
  ('Perfil 20',         'QUIMICA COMPLETA'),
  ('Perfil Reumatoide', 'PCR Y RA TEST CUANT')
) as m(nombre, hoja)
where s.nombre = m.nombre and s.categoria = 'laboratorio' and s.plantilla is null
  and exists (select 1 from plantilla_examen p where p.examen = m.hoja);

-- Cada analito de esas hojas tiene que existir en el catálogo para poder
-- ser componente. El que no existe entra como «no se vende suelto»:
-- apagado y sin precio, así que quitarlo del perfil no descuenta nada.
-- Orina y heces no: se venden enteras y sus renglones no son exámenes.
insert into servicio (nombre, categoria, precio, moneda, activo)
select distinct on (upper(btrim(h.analito))) btrim(h.analito), 'laboratorio', 0, 'USD', false
from servicio p
join plantilla_examen h on h.examen = p.plantilla and h.tipo = 'analito' and btrim(h.analito) <> ''
where p.categoria = 'laboratorio' and p.plantilla not in ('ORINA', 'HECES', 'H. ESP')
  and not exists (
    select 1 from servicio s
     where s.categoria = 'laboratorio' and upper(btrim(s.nombre)) = upper(btrim(h.analito))
  );

-- Y los componentes de cada ítem con hoja, en el orden de la hoja.
insert into servicio_componente (servicio_id, componente_id, orden)
select p.id, c.id, min(h.orden)
from servicio p
join plantilla_examen h on h.examen = p.plantilla and h.tipo = 'analito' and btrim(h.analito) <> ''
join lateral (
  select s.id from servicio s
   where s.categoria = 'laboratorio' and s.id <> p.id
     and upper(btrim(s.nombre)) = upper(btrim(h.analito))
   order by s.activo desc, s.precio desc
   limit 1
) c on true
where p.categoria = 'laboratorio' and p.plantilla not in ('ORINA', 'HECES', 'H. ESP')
group by p.id, c.id
on conflict do nothing;
