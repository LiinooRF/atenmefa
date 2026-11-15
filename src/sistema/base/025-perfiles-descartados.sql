-- LOS PERFILES DEL EXCEL, FUERA
--
-- Los perfiles se habían armado con las pestañas del archivo del
-- laboratorio. Desde el baremo (020) los perfiles de verdad son ítems con
-- su precio —Perfil 20, Lípido, Tiroideo— y los del Excel quedaron
-- apagados: marcaban analitos que ya no se venden sueltos, algunos
-- cobraban la suma en vez del precio del baremo y la pantalla los mostraba
-- con «0 exámenes». Confundían, y se borran. Los que el laboratorio use de
-- verdad se arman a mano en la pantalla de Perfiles.
--
-- Se borran los APAGADOS. En la demo están todos prendidos y funcionan
-- como combos, así que ahí no cambia nada. Ninguna orden los referencia:
-- los renglones apuntan a servicio, no a perfil.
--
-- Quedan anotados como descartados. Sin eso, la tarjeta de «cargar los
-- exámenes y los perfiles» los volvía a contar como faltantes, y el primer
-- toque los recreaba, esta vez prendidos.

create table if not exists perfil_descartado (
  nombre_busca  text primary key,
  descartado    timestamptz not null default now()
);

comment on table perfil_descartado is
  'Perfiles que se borraron a propósito: el cargador del archivo no los vuelve a crear.';

insert into perfil_descartado (nombre_busca)
select nombre_busca from perfil where not activo
on conflict do nothing;

delete from perfil where not activo;
