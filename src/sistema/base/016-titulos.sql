-- Un renglón de plantilla puede ser un ANALITO o un SUBTÍTULO, y hasta
-- ahora se adivinaba.
--
-- EL PROBLEMA
--
-- Las hojas del laboratorio no son listas planas: la de coagulación tiene
-- dos bloques y la de depuración tres, y cada bloque arranca con un
-- renglón que es puro encabezado —«TIEMPO DE PROTROMBINA:», «ANALISIS
-- QUIMICO:»— sin unidad ni rango.
--
-- El informe impreso los reconocía por descarte: «sin valor, sin unidad y
-- sin rango, entonces es un título». Funciona para imprimir, pero la
-- pantalla de valores de referencia usaba la misma regla para contar lo
-- que falta, y ahí miente: de 50 renglones sin rango, 16 son encabezados
-- que nunca van a tener uno. El laboratorio veía «51 sin rango» y la
-- mitad no era trabajo suyo.
--
-- Al revés también falla: el tipiaje, el VDRL, el cultivo y la gota gruesa
-- tampoco tienen unidad ni rango —se informan NEGATIVO o POSITIVO— y por
-- descarte quedaban clasificados como encabezados.
--
-- LA SOLUCIÓN
--
-- Se guarda. Deja de ser una deducción y pasa a ser un dato que el
-- laboratorio puede corregir en pantalla.
alter table plantilla_examen
  add column if not exists tipo text not null default 'analito';

alter table plantilla_examen
  drop constraint if exists plantilla_examen_tipo_check;
alter table plantilla_examen
  add constraint plantilla_examen_tipo_check check (tipo in ('analito', 'titulo'));

-- Los que terminan en dos puntos: así los escribió el archivo y no hay
-- ninguno que sea un analito de verdad.
update plantilla_examen
   set tipo = 'titulo'
 where btrim(unidad) = '' and btrim(referencia) = ''
   and btrim(analito) ~ ':$';

-- Y los encabezados que su archivo escribió sin los dos puntos. Son cinco
-- y están verificados contra las celdas de sus hojas, una por una:
--
--   COAG. B21   TIEMPO DE TROMBOPLASTINA PARCIAL ACTIVADA  — abre el bloque del PTT
--   DEPU. B13   DEPURACION DE CREATININA                   — es el título de la hoja
--   HEPATITIS   MARCADORES VIRALES                         — abre la lista de marcadores
--   URO1        RESULTADOS                                 — abre el bloque de resultados
--   H. ESP      ANALISIS MACROSCOPICO                      — la mitad macroscópica
--
-- No se dedujo por forma: se leyeron las celdas. Lo que NO entra acá es el
-- tipiaje, el VDRL, el grupo sanguíneo, el cultivo, la gota gruesa, el INR
-- ni la proteinuria cualitativa: tampoco tienen unidad ni rango, pero son
-- determinaciones que se informan con una palabra.
update plantilla_examen
   set tipo = 'titulo'
 where (examen, analito) in (
   ('COAG.',     'TIEMPO DE TROMBOPLASTINA PARCIAL ACTIVADA'),
   ('DEPU.',     'DEPURACION DE CREATININA'),
   ('HEPATITIS', 'MARCADORES VIRALES'),
   ('URO1',      'RESULTADOS'),
   ('H. ESP',    'ANALISIS MACROSCOPICO')
 );

-- LA HOJA DE HECES ENTRÓ CON UNIDADES QUE NO SON SUYAS
--
-- «H. ESP» es un formulario de dos mitades, del mismo tipo que ORINA y
-- HECES, que quedaron afuera a propósito. Esta se coló, y se nota: el
-- color, el aspecto, la consistencia y el moco salieron con unidad
-- «mg/dl», que es de la columna de al lado. Un color no se mide en mg/dl.
--
-- Se borran las unidades. Los nombres se dejan como están —son los campos
-- de verdad de un examen macroscópico de heces— y lo que quede por
-- arreglar lo arregla el laboratorio desde la pantalla, que para eso está.
update plantilla_examen
   set unidad = ''
 where examen = 'H. ESP'
   and analito in ('ANALISIS MACROSCOPICO', 'ASPECTO', 'COLOR', 'CONSISTENCIA',
                   'MOCO', 'SANGRE', 'RESIDUOS', 'Hematíes:');
