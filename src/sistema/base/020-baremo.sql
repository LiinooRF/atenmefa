-- El baremo del laboratorio, del PDF que mandó el cliente.
--
-- POR QUÉ ESTO REEMPLAZA EL CATÁLOGO QUE HABÍA
--
-- El catálogo se había armado de las hojas de su archivo de Excel, al nivel
-- de los ANALITOS: HEMOGLOBINA, HEMATOCRITO, VCM, HCM… 141 renglones, todos
-- en 0. La apuesta era que se cobraba a ese nivel —«un perfil puede tener 5
-- exámenes y yo solo quiero 3»— y su lista de precios dice que no: cobra
-- «Hematología Completa, 4$» de una pieza. De los 141 analitos, su baremo le
-- pone precio a unos 30; a los otros 110 no los nombra, porque no se venden
-- sueltos: son los RENGLONES DEL INFORME, y esos viven en plantilla_examen,
-- que es donde tienen que estar.
--
-- Así que los analitos sin precio se DESACTIVAN, no se borran: los renglones
-- ya cargados siguen apuntando a ellos y una orden vieja tiene que poder
-- leerse igual. Volver atrás es un UPDATE.
--
-- LOS NOMBRES
--
-- Cuando su lista y el catálogo nombran el mismo examen, gana el nombre que
-- ya estaba: así el informe le sigue rellenando solos la unidad y el rango
-- desde la plantilla, que es un cruce por nombre exacto. Cuando el examen es
-- nuevo, va con la palabra de su lista.
--
-- LO QUE QUEDA SIN PRECIO, A PROPÓSITO
--
-- Ocho exámenes aparecen DOS VECES en el PDF con precios distintos: la LH
-- vale 8$ en «Pruebas Especiales» y 10$ en «Perfil Hormonal». No se elige
-- uno: quedan en 0 y activos, visibles en el catálogo, hasta que el cliente
-- diga cuál es. Un precio inventado se factura; un 0 se ve.

BEGIN;

CREATE TEMP TABLE baremo (nombre text, categoria text, precio numeric) ON COMMIT DROP;

-- Para comparar nombres sin depender de mayúsculas ni de tildes.
CREATE FUNCTION pg_temp.norma(t text) RETURNS text AS $$
  SELECT lower(regexp_replace(
    translate(coalesce($1, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'),
    '\s+', ' ', 'g'))
$$ LANGUAGE sql IMMUTABLE;

INSERT INTO baremo (nombre, categoria, precio) VALUES
  -- Hematología
  ('Hematología Completa',                      'laboratorio',  4),
  ('Reticulocitos',                             'laboratorio',  4),
  ('Drepanocitos',                              'laboratorio',  4),
  ('Velocidad de Sedimentación Globular (VSG)', 'laboratorio',  3),
  ('GOTA GRUESA',                               'laboratorio',  4),
  ('Prueba de Leishmaniasis',                   'laboratorio', 30),
  ('GRUPO SANGUINEO',                           'laboratorio',  4),
  -- Coagulación
  ('PT',                                        'laboratorio',  4),
  ('PTT',                                       'laboratorio',  4),
  ('FIBRINOGENO',                               'laboratorio',  4),
  -- Uroanálisis
  ('General de Orina',                          'laboratorio',  3),
  ('Índice Prot/Creat',                         'laboratorio',  8),
  -- Coproanálisis
  ('Examen de Heces',                           'laboratorio',  3),
  ('Especial de Heces',                         'laboratorio',  5),
  ('Leucograma',                                'laboratorio',  4),
  ('Coprocultivo',                              'laboratorio', 15),
  -- Bacteriología
  ('Urocultivo',                                'laboratorio', 15),
  ('Cultivo y Ant. de Secreción',               'laboratorio', 15),
  -- Citología. El rótulo de la sección entra en el nombre: suelto, «Vaginal»
  -- y «Muestra solamente» no dicen de qué son en una lista alfabética.
  ('Citología Vaginal (con todo incluido)',     'laboratorio', 30),
  ('Citología — muestra solamente',             'laboratorio', 15),
  -- Química sanguínea
  ('GLICEMIA',                                  'laboratorio',  3),
  ('GLICEMIA POSPRANDIAL',                      'laboratorio',  8),
  ('Glicemia Curva T',                          'laboratorio', 10),
  ('UREA',                                      'laboratorio',  3),
  ('CREATININA',                                'laboratorio',  3),
  ('COLESTEROL TOTAL',                          'laboratorio',  3),
  ('TRIGLICERIDOS',                             'laboratorio',  3),
  ('ACIDO URICO',                               'laboratorio',  3),
  ('Perfil Lípido',                             'laboratorio',  8),
  ('AST/TGO',                                   'laboratorio',  3),
  ('ALT/ GPT',                                  'laboratorio',  3),
  ('Bilirrubina Total y Fraccionada',           'laboratorio',  6),
  ('FOSFATASA ALCALINA',                        'laboratorio',  4),
  ('Fosfatasa Ácida Prostática',                'laboratorio',  8),
  ('Fosfatasa Ácida Total',                     'laboratorio',  8),
  ('FOSFORO (P)',                               'laboratorio',  5),
  ('CALCIO (Ca)',                               'laboratorio',  3),
  ('Proteínas Totales y Fraccionadas',          'laboratorio',  4),
  ('HIERRO SÉRICO',                             'laboratorio',  7),
  ('Perfil Ferropénico',                        'laboratorio', 30),
  ('MAGNESIO (Mg)',                             'laboratorio',  7),
  ('Electrolitos Na+K+Cl',                      'laboratorio', 12),
  ('AMILASA',                                   'laboratorio',  8),
  ('Lipasa',                                    'laboratorio',  8),
  ('CK TOTAL',                                  'laboratorio',  8),
  ('CK-MB',                                     'laboratorio',  8),
  ('GAMMA-GLUTAMIL TRANSFERASA',                'laboratorio',  7),
  ('LDH',                                       'laboratorio',  7),
  -- Serología
  ('PRUEBA DE EMBARAZO EN SANGRE',              'laboratorio',  4),
  ('HIV',                                       'laboratorio',  4),
  ('VDRL',                                      'laboratorio',  4),
  ('RA TEST CUANTITATIVO',                      'laboratorio',  7),
  ('PCR',                                       'laboratorio',  4),
  ('Serología para Hongos',                     'laboratorio',  7),
  ('Serología para Leptospira',                 'laboratorio',  7),
  ('Anticuerpos Nucleares',                     'laboratorio',  7),
  -- Pruebas especiales
  ('HEMOGLOBINA GLICADA (HbA1c)',               'laboratorio',  8),
  ('Toxoplasma IgG - IgM',                      'laboratorio', 12),
  ('Perfil Tiroideo',                           'laboratorio', 18),
  ('T 3 libre',                                 'laboratorio',  6),
  ('T 4 libre',                                 'laboratorio',  6),
  ('TSHus',                                     'laboratorio',  6),
  ('Dengue Blot IgG - IgM',                     'laboratorio',  6),
  ('Helicobacter pylori IgG - IgM',             'laboratorio', 10),
  ('Helicobacter pylori en heces',              'laboratorio',  6),
  ('ASTO',                                      'laboratorio',  8),
  ('Antígenos Febriles',                        'laboratorio',  8),
  -- «8$ c/u»: son tres determinaciones a 8 cada una, no una de 8.
  ('INSULINA BASAL',                            'laboratorio',  8),
  ('INSULINA POSPRANDIAL',                      'laboratorio',  8),
  ('Insulina Post Carga',                       'laboratorio',  8),
  ('PSA',                                       'laboratorio', 12),
  ('PSA LIBRE',                                 'laboratorio',  6),
  ('PSA TOTAL',                                 'laboratorio',  6),
  ('Inmunoglobulina E (IgE)',                   'laboratorio',  8),
  ('Anticardiolipinas IgG - IgM',               'laboratorio', 20),
  ('Antifosfolípidos',                          'laboratorio', 10),
  ('Troponina',                                 'laboratorio',  8),
  -- Estradiol dice 10 en los tres sitios donde aparece: no hay qué preguntar.
  ('ESTRADIOL (E2)',                            'laboratorio', 10),
  ('Hepatitis A IgM - IgG',                     'laboratorio', 15),
  ('Hepatitis B (Anticore - Antígeno de Superficie)', 'laboratorio', 12),
  ('Hepatitis C',                               'laboratorio',  6),
  ('FTA',                                       'laboratorio', 10),
  -- Los perfiles del baremo tienen precio PROPIO y es menor que la suma de
  -- sus partes: el Perfil 20 vale 30$ y sus diez exámenes sumados dan 37$.
  -- Por eso entran como un renglón con su precio y no como un combo que
  -- marca exámenes: marcándolos, la cuenta cobraría los 37.
  ('Perfil 20',                                 'laboratorio', 30),
  ('Perfil Hepático',                           'laboratorio', 15),
  ('Perfil Reumatoide',                         'laboratorio', 20),
  ('Perfil Covid 19',                           'laboratorio', 40),
  ('Serología Perfil Covid',                    'laboratorio', 25),
  -- Marcadores tumorales
  ('HE4',                                       'laboratorio', 20),
  ('CA 125',                                    'laboratorio', 20),
  ('CA 15-3',                                   'laboratorio', 20),
  ('CA 19-9',                                   'laboratorio', 20),
  ('Beta 2 Microglobulina',                     'laboratorio', 20),
  ('TIROGLOBULINA',                             'laboratorio', 20),
  -- Material de la toma. Categoría «equipo» y no «laboratorio»: no son
  -- exámenes, no llevan resultado, y así no aparecen en el selector de
  -- exámenes de la orden pidiendo un valor que nadie va a medir.
  ('Envase de orina',                           'equipo',     0.80),
  ('Envase de heces',                           'equipo',     0.80),
  ('Kit de muestra',                            'equipo',        5);

-- Los ocho que el PDF nombra dos veces con precios distintos. Se quedan
-- activos y en 0 a la vista de administración, esperando la respuesta.
CREATE TEMP TABLE sin_resolver (nombre text) ON COMMIT DROP;
INSERT INTO sin_resolver (nombre) VALUES
  ('HORMONA LUTEINIZANTE (LH)'),          -- 8$ en especiales, 10$ en hormonal
  ('HORMONA FOLICULOESTIMULANTE (FSH)'),  -- 8$ / 10$
  ('PROLACTINA (PRL)'),                   -- 8$ / 10$
  ('PROGESTERONA'),                       -- 8$ / 10$
  ('ANTÍGENO CARCINOEMBRIONARIO (CEA)'),  -- 25$ / 20$
  ('ALFA-FETOPROTEÍNA (AFP)'),            -- 10$ / 20$
  ('BHCG CUANTITATIVA'),                  -- 8$ (HCG cuant.) / 20$ (Beta HCG)
  ('TESTOSTERONA TOTAL'),                 -- 8$ + 8$ sueltas / 20$ las dos
  ('TESTOSTERONA LIBRE');

-- 1. Lo que ya estaba con ese nombre: se le pone el precio del baremo.
UPDATE servicio s
   SET precio = b.precio, moneda = 'USD', activo = true
  FROM baremo b
 WHERE s.categoria = b.categoria
   AND pg_temp.norma(s.nombre) = pg_temp.norma(b.nombre);

-- 2. Lo que no estaba: entra con el nombre de su lista.
INSERT INTO servicio (nombre, categoria, precio, moneda, activo)
SELECT b.nombre, b.categoria, b.precio, 'USD', true
  FROM baremo b
 WHERE NOT EXISTS (
         SELECT 1 FROM servicio s
          WHERE s.categoria = b.categoria
            AND pg_temp.norma(s.nombre) = pg_temp.norma(b.nombre));

-- 3. Los analitos que el baremo no vende sueltos salen del selector. Solo
--    los que están en 0: si administración le puso precio a algo a mano, es
--    porque lo cobra, y eso no se toca.
UPDATE servicio s
   SET activo = false
 WHERE s.categoria = 'laboratorio'
   AND s.activo
   AND s.precio = 0
   AND NOT EXISTS (SELECT 1 FROM baremo b
                    WHERE pg_temp.norma(b.nombre) = pg_temp.norma(s.nombre))
   AND NOT EXISTS (SELECT 1 FROM sin_resolver p
                    WHERE pg_temp.norma(p.nombre) = pg_temp.norma(s.nombre));

-- 4. Los perfiles que se habían armado de las hojas del Excel quedan fuera:
--    agrupaban analitos que ya no se venden sueltos, así que el selector no
--    marcaría nada. Los perfiles de verdad son los del baremo y entraron
--    arriba con su precio. Desactivados, no borrados.
UPDATE perfil SET activo = false WHERE activo;

COMMIT;
