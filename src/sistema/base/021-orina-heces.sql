-- ORINA Y HECES: LAS HOJAS QUE SE INFORMAN CON PALABRAS
--
-- 013 cargó 35 hojas del archivo del laboratorio y dejó estas dos afuera a
-- propósito: sus renglones no son «un analito, una cifra, un rango». Son
-- renglones que se responden eligiendo una palabra —ASPECTO: CLARA, COLOR:
-- AMARILLA, PROTEINAS: NEGATIVO— y el rango de la mitad macroscópica no es
-- el de la microscópica, así que cargarlos como si fueran QUIMICA RUTINA
-- habría puesto un rango de otra hoja al lado de cada respuesta.
--
-- El resultado fue que el bioanalista los escribe a mano en cada orden, y
-- son los formularios que más se repiten: el General de Orina y el Examen
-- de Heces salen todos los días.
--
-- LO QUE TRAE ESTA MIGRACIÓN
--
-- 1. La columna `opciones`: la lista de palabras que su hoja ofrece para
--    ese renglón, una por línea. Salieron de la hoja «DAT.», que es donde
--    el archivo guarda los menús desplegables que usan ORINA y HECES. La
--    lista de parásitos salió de la columna 72 de HECES, que es su propio
--    menú. Ninguna se escribió de memoria.
--
-- 2. Las plantillas de ORINA y HECES, con los rangos que su propia hoja sí
--    traía (0 - 2 x CMP en los leucocitos de la orina, 0 - 1 x CMP en los
--    de las heces) y las opciones al lado de los que se eligen de una
--    lista. Los renglones quedaron en el orden en que se leen en el
--    informe: la mitad macroscópica, la química y la microscópica.
--
-- 3. El arreglo de H. ESP, que sí estaba cargada pero con las unidades
--    prestadas de la columna de al lado: ASPECTO no se mide en mg/dl y
--    Leucocitos quedó sin el «0 - 1 x CMP» que su hoja sí dice. Esa hoja
--    es el Examen de Heces Especial del baremo y hoy también puede tener
--    menú de opciones.

alter table plantilla_examen
  add column if not exists opciones text not null default '';

-- Por si se corre dos veces: las hojas nuevas se borran y se vuelven a
-- escribir enteras, igual que hace guardarPlantilla cuando el laboratorio
-- las corrige en pantalla.
delete from plantilla_examen where examen in ('ORINA', 'HECES');

insert into plantilla_examen (examen, orden, analito, unidad, referencia, tipo, opciones) values
  -- GENERAL DE ORINA --------------------------------------------------
  -- Las opciones de los cuatro primeros son el menú de la hoja DAT.
  ('ORINA', 1,  'EXAMEN MACROSCOPICO', '', '', 'titulo', ''),
  ('ORINA', 2,  'ASPECTO',  '', '', 'analito', E'CLARA\nLIG. TURBIDEZ\nTURBIO'),
  ('ORINA', 3,  'COLOR',    '', '', 'analito', E'AMARILLA\nAMBAR\nROJIZO\nNARANJA'),
  ('ORINA', 4,  'PH',       '', '', 'analito', E'ACIDA (5)\nACIDA (6)\nACIDA (6,5)\nNEUTRO (7)\nALCALINO (8)'),
  ('ORINA', 5,  'DENSIDAD', '', '', 'analito', E'1000\n1005\n1010\n1015\n1020\n1025\n1030'),
  ('ORINA', 6,  'ANALISIS QUIMICO:', '', '', 'titulo', ''),
  -- La escala de la tira reactiva, tal como la escribió su hoja DAT.
  ('ORINA', 7,  'PROTEINAS',      '', '', 'analito', E'NEGATIVO\nTRAZAS\nPOSITIVO\nPOSITIVO (2+)\nPOSITIVO (3+)\nPOSITIVO (4+)'),
  ('ORINA', 8,  'HEMOGLOBINA',    '', '', 'analito', E'NEGATIVO\nTRAZAS\nPOSITIVO\nPOSITIVO (2+)\nPOSITIVO (3+)\nPOSITIVO (4+)'),
  ('ORINA', 9,  'CETONAS',        '', '', 'analito', E'NEGATIVO\nTRAZAS\nPOSITIVO\nPOSITIVO (2+)\nPOSITIVO (3+)\nPOSITIVO (4+)'),
  ('ORINA', 10, 'GLUCOSA',        '', '', 'analito', E'NEGATIVO\nTRAZAS\nPOSITIVO\nPOSITIVO (2+)\nPOSITIVO (3+)\nPOSITIVO (4+)'),
  ('ORINA', 11, 'NITRITOS',       '', '', 'analito', E'NEGATIVO\nTRAZAS\nPOSITIVO\nPOSITIVO (2+)\nPOSITIVO (3+)\nPOSITIVO (4+)'),
  ('ORINA', 12, 'UROBILINOGENO',  '', '', 'analito', E'NEGATIVO\nTRAZAS\nPOSITIVO\nPOSITIVO (2+)\nPOSITIVO (3+)\nPOSITIVO (4+)'),
  ('ORINA', 13, 'BILIRRUBINA',    '', '', 'analito', E'NEGATIVO\nTRAZAS\nPOSITIVO\nPOSITIVO (2+)\nPOSITIVO (3+)\nPOSITIVO (4+)'),
  ('ORINA', 14, 'EXAMEN MICROSCOPICO:', '', '', 'titulo', ''),
  ('ORINA', 15, 'LEUCOCITOS',     '', '0 - 2 x CMP', 'analito', ''),
  ('ORINA', 16, 'HEMATIES',       '', '0 - 2 x CMP', 'analito', ''),
  ('ORINA', 17, 'BACTERIAS',      '', 'ESCASAS x CMP', 'analito', E'ESCASAS\nMODERADAS\nABUNDANTAS'),
  ('ORINA', 18, 'CELULAS PLANAS', '', 'ESCASAS x CMP', 'analito', E'ESCASAS\nMODERADAS\nABUNDANTAS'),
  ('ORINA', 19, 'MUCINA',         '', 'ESCASAS x CMP', 'analito', E'ESCASAS\nMODERADAS\nABUNDANTAS'),
  ('ORINA', 20, 'CILINDROS',      '', 'HIALINOS 0 - 1 x CMP (40X)', 'analito', ''),
  ('ORINA', 21, 'CRISTALES',      '', '', 'analito',
    -- Los dieciocho de la columna de notas de su propia hoja.
    E'OXALATO DE CALCIO ESC x CMP\nOXALATO DE CALCIO MOD x CMP\nOXALATO DE CALCIO ABUN x CMP\nACIDO URICO ESC x CMP\nACIDO URICO MOD x CMP\nACIDO URICO ABUN x CMP\nURATOS AMORFOS ESC x CMP\nURATOS AMORFOS MOD x CMP\nURATOS AMORFOS ABUN x CMP\nFOSFATOS AMORFOS ESC x CMP\nFOSFATOS AMORFOS MOD x CMP\nFOSFATOS AMORFOS ABUN x CMP\nFOSFATO TRIPLE ESC x CMP\nFOSFATO TRIPLE MOD x CMP\nFOSFATO TRIPLE ABUN x CMP\nBIURATOS DE AMONIO ESC x CMP\nBIURATOS DE AMONIO MOD x CMP\nBIURATOS DE AMONIO ABUN x CMP'),

  -- GENERAL DE HECES ---------------------------------------------------
  ('HECES', 1,  'ANALISIS MACROSCOPICO', '', '', 'titulo', ''),
  ('HECES', 2,  'ASPECTO',      '', '', 'analito', E'HETEROGENEO\nHOMOGENEO'),
  ('HECES', 3,  'COLOR',        '', '', 'analito', E'AMARILLO\nMARRON\nGRIS\nNEGRUZCA\nBLANQUECINO\nVERDE'),
  ('HECES', 4,  'CONSISTENCIA', '', '', 'analito', E'BLANDA\nPASTOSA\nDIARREICA\nDURA'),
  ('HECES', 5,  'RESIDUOS',     '', '', 'analito', E'ESCASOS\nMODERADOS\nABUNDANTES'),
  ('HECES', 6,  'MOCO',         '', '', 'analito', E'NO VISIBLES'),
  ('HECES', 7,  'SANGRE',       '', '', 'analito', E'NO VISIBLES'),
  ('HECES', 8,  'ANALISIS MICROSCOPICO:', '', '', 'titulo', ''),
  -- La primera opción es la respuesta de siempre, tal como su hoja la
  -- escribe; el resto es su menú de parásitos, palabra por palabra.
  ('HECES', 9,  'NO SE OBSERVARON PARASITOS NI SUS FORMAS EVOLUTIVAS', '', '', 'analito',
    E'NO SE OBSERVARON PARASITOS NI SUS FORMAS EVOLUTIVAS\nQuistes de Giardia intestinalis\nQuistes de Entamoeba coli\nQuistes de Complejo Entamoeba\nHuevos de Ascaris lumbricoides\nQuistes de Endolimax nana.\nQuistes de Blastocystis spp menor de 5 x CMP\nQuistes de Blastocystis spp mayor de 5 x CMP\nTrofozoito de Entamoeba hystolitica\nTrofozoito de Giardia intestinalis\nQuistes de Iodamoeba butschlii\nHuevos de Trichuris trichiura'),
  ('HECES', 10, 'Restos de Almidón', '', '', 'analito', E'Escasos\nModerados\nAbundantes'),
  ('HECES', 11, 'Leucocitos:', '', '0 - 1 x CMP', 'analito', ''),
  ('HECES', 12, 'Hematíes:',   '', '0 - 1 x CMP', 'analito', '');

-- EL ARREGLO DE H. ESP -------------------------------------------------
-- Sus unidades salieron de la columna de bioquímica que está a la derecha
-- en la misma fila del Excel: nadie mide un COLOR en mg/dl. Los rangos de
-- Leucocitos y Hematíes sí los trae la hoja y nunca se cargaron.

update plantilla_examen set unidad = '', referencia = ''
 where examen = 'H. ESP' and tipo = 'titulo' and btrim(unidad) <> '';

update plantilla_examen set unidad = ''
 where examen = 'H. ESP'
   and analito in ('ASPECTO', 'COLOR', 'CONSISTENCIA', 'MOCO', 'SANGRE', 'RESIDUOS');

update plantilla_examen set referencia = '0 - 1 x CMP', unidad = ''
 where examen = 'H. ESP' and analito in ('Leucocitos:', 'Hematíes:');

update plantilla_examen set opciones = E'HETEROGENEO\nHOMOGENEO'
 where examen = 'H. ESP' and analito = 'ASPECTO';
update plantilla_examen set opciones = E'AMARILLO\nMARRON\nGRIS\nNEGRUZCA\nBLANQUECINO\nVERDE'
 where examen = 'H. ESP' and analito = 'COLOR';
update plantilla_examen set opciones = E'BLANDA\nPASTOSA\nDIARREICA\nDURA'
 where examen = 'H. ESP' and analito = 'CONSISTENCIA';
update plantilla_examen set opciones = E'ESCASOS\nMODERADOS\nABUNDANTES'
 where examen = 'H. ESP' and analito = 'RESIDUOS';
update plantilla_examen set opciones = E'NO VISIBLES'
 where examen = 'H. ESP' and analito in ('MOCO', 'SANGRE');
update plantilla_examen set opciones =
  E'NO SE OBSERVARON PARASITOS NI SUS FORMAS EVOLUTIVAS\nQuistes de Giardia intestinalis\nQuistes de Entamoeba coli\nQuistes de Complejo Entamoeba\nHuevos de Ascaris lumbricoides\nQuistes de Endolimax nana.\nQuistes de Blastocystis spp menor de 5 x CMP\nQuistes de Blastocystis spp mayor de 5 x CMP\nTrofozoito de Entamoeba hystolitica\nTrofozoito de Giardia intestinalis\nQuistes de Iodamoeba butschlii\nHuevos de Trichuris trichiura'
 where examen = 'H. ESP'
   and analito = 'NO SE OBSERVARON PARASITOS NI SUS FORMAS EVOLUTIVAS';
