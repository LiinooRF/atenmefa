-- NOMBRES CLAROS PARA LAS HOJAS DEL LABORATORIO
--
-- Las plantillas se llaman como las pestañas del Excel del laboratorio:
-- «URO1», «COAG.», «HEMA», «TRANS-PROT-AMIL-Ca-P». El bioanalista las
-- elegía de una lista con esos nombres, y recepción veía «URO1» en una
-- orden. Acá cada hoja recibe un nombre que se lee.
--
-- El nombre de la pestaña sigue siendo la llave: las plantillas, los
-- enlaces del catálogo (servicio.plantilla) y las pruebas la usan, y
-- cambiarla movía todo. Esto es solo cómo se MUESTRA. Salieron de lo que
-- trae cada hoja —sus renglones y el título de su celda—, sin agregar ni
-- quitar exámenes, y se corrigen desde la pantalla de cada hoja.

create table hoja_nombre (
  examen  text primary key,
  nombre  text not null check (btrim(nombre) <> '' and length(nombre) <= 120)
);

comment on table hoja_nombre is
  'Cómo se muestra cada hoja de plantilla_examen. La llave sigue siendo el nombre de la pestaña del Excel.';

insert into hoja_nombre (examen, nombre)
select m.examen, m.nombre
from (values
  ('B-HCG CUANTIFICADA',          'BHCG cuantitativa'),
  ('COAG.',                       'Coagulación (PT, PTT y fibrinógeno)'),
  ('DENGUE',                      'Dengue IgM e IgG'),
  ('DEPU.',                       'Depuración de creatinina y proteinuria (24 h)'),
  ('ELECTROLITOS',                'Electrolitos'),
  ('ESPECIAL DE GLICEMIA',        'Glicemia, insulina y hemoglobina glicada'),
  ('ESTRADIOL, PROGESTERONA',     'Estradiol y progesterona'),
  ('FOSF-AMIL-LDH-CKT-CKMB',      'Fosfatasa alcalina, amilasa, LDH y CK'),
  ('FSH, PROLACTINA',             'FSH y prolactina'),
  ('GOTA GRUESA',                 'Gota gruesa'),
  ('H. ESP',                      'Examen especial de heces'),
  ('HECES',                       'Examen de heces'),
  ('HELICOBACTER IgM-IgG',        'Helicobacter pylori IgM e IgG'),
  ('HELICOTEST',                  'Helicobacter pylori (prueba rápida)'),
  ('HEMA',                        'Hematología completa'),
  ('HEPATITIS',                   'Hepatitis A y B'),
  ('HIERRO,  PERFIL FERREPENICO', 'Perfil ferropénico'),
  ('HIV-VDRL-TIPIAJE',            'HIV, VDRL y tipiaje'),
  ('LH',                          'LH'),
  ('MARCADORES TUMORALES',        'Marcadores tumorales'),
  ('ORINA',                       'Examen general de orina'),
  ('PBA.EMB Y OTRAS CUALI',       'Prueba de embarazo y otras cualitativas'),
  ('PCR Y RA TEST CUANT',         'PCR y RA test cuantitativos'),
  ('PERFIL LIPIDICO',             'Perfil lipídico'),
  ('PERFIL TIROIDEO',             'Perfil tiroideo'),
  ('PROT',                        'Proteínas totales y fraccionadas'),
  ('PSA T Y L.',                  'PSA total y libre'),
  ('QUIMICA COMPLETA',            'Química completa'),
  ('QUIMICA PREOP.',              'Química preoperatoria'),
  ('QUIMICA RUTINA',              'Química de rutina'),
  ('TESTOSTERONA, DHEA',          'Testosterona y DHEA'),
  ('TIPIAJE-VSG',                 'Tipiaje y VSG'),
  ('TOXO',                        'Toxoplasma IgM e IgG'),
  -- La misma hoja dos veces en su archivo: se nota en el nombre.
  ('TOXO (2)',                    'Toxoplasma IgM e IgG (segunda hoja)'),
  ('TRANS-BIL-PROT',              'Transaminasas, bilirrubina y proteínas'),
  ('TRANS-PROT-AMIL-Ca-P',        'Transaminasas, proteínas, amilasa, calcio y fósforo'),
  ('URO1',                        'Urocultivo')
) as m(examen, nombre)
-- Solo las hojas que existen en esta base.
where exists (select 1 from plantilla_examen p where p.examen = m.examen)
on conflict (examen) do nothing;
