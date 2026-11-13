-- CON QUÉ HOJA SE INFORMA CADA EXAMEN DEL BAREMO
--
-- Desde 020 el laboratorio cobra lo que vende su baremo: «Hematología
-- Completa, 4$», «Perfil Lípido, 8$». Pero una orden de Hematología
-- Completa abría el informe con UNA línea y el bioanalista tenía que ir a
-- buscar los doce renglones a mano con «o las líneas de».
--
-- Ahora cada ítem del baremo puede decir con qué hoja se informa. Se sigue
-- cobrando el precio del ítem (30$ el Perfil 20, no la suma de sus
-- partes) y el informe abre con los renglones de su hoja.
--
-- Solo se enlazan los que tienen su hoja en el archivo del laboratorio y
-- son lo mismo sin tener que adivinar. Los perfiles del baremo que no
-- tienen hoja —Perfil 20, Hepático, Reumatoide, los de Covid— quedan sin
-- enlazar hasta que el laboratorio diga qué llevan: se enlazan desde
-- Servicios sin tocar SQL.

alter table servicio
  add column if not exists plantilla text;

comment on column servicio.plantilla is
  'Hoja de plantilla_examen con la que se informa. NULL: una línea con el nombre del servicio.';

update servicio s set plantilla = m.hoja
from (values
  ('Hematología Completa',              'HEMA'),
  ('Perfil Lípido',                     'PERFIL LIPIDICO'),
  ('Perfil Tiroideo',                   'PERFIL TIROIDEO'),
  ('Perfil Ferropénico',                'HIERRO,  PERFIL FERREPENICO'),
  ('General de Orina',                  'ORINA'),
  ('Examen de Heces',                   'HECES'),
  ('Especial de Heces',                 'H. ESP'),
  ('Proteínas Totales y Fraccionadas',  'PROT'),
  ('Dengue Blot IgG - IgM',             'DENGUE'),
  ('Helicobacter pylori IgG - IgM',     'HELICOBACTER IgM-IgG'),
  -- TOXO y TOXO (2) son la misma hoja dos veces en su archivo.
  ('Toxoplasma IgG - IgM',              'TOXO')
) as m(nombre, hoja)
where s.nombre = m.nombre
  and s.categoria = 'laboratorio'
  and s.plantilla is null
  and exists (select 1 from plantilla_examen p where p.examen = m.hoja);

-- Los perfiles armados de las pestañas del Excel quedaron apagados en 020 y
-- sin exámenes a la vista: en la pantalla de Perfiles parecía que no había
-- nada cargado. Se borran los apagados que no marcan ningún examen activo
-- y que se llaman como una hoja del archivo: los que armó alguien a mano
-- se quedan, aunque estén vacíos. Las órdenes no los referencian (los
-- renglones apuntan a servicio), así que no se pierde historia. En la demo
-- siguen prendidos y no se tocan.
delete from perfil p
where not p.activo
  and exists (
    select 1 from plantilla_examen h
    where upper(regexp_replace(btrim(h.examen), '\s+', ' ', 'g'))
        = upper(regexp_replace(btrim(p.nombre), '\s+', ' ', 'g'))
  )
  and not exists (
    select 1 from perfil_examen pe
    join servicio s on s.id = pe.servicio_id
    where pe.perfil_id = p.id and s.activo
  );
