-- Plantillas de examen del laboratorio.
--
-- Pedro mandó su archivo de trabajo: LABORATORIO CA.xls, 62 hojas, una por
-- examen, cada una con sus analitos, sus unidades y sus valores de
-- referencia. Es lo que venía usando: elige la hoja, teclea los valores,
-- imprime. Esto es ese archivo, leído.
--
-- PARA QUÉ SIRVE
--
-- El bioanalista elige el examen y le aparecen sus renglones con el nombre
-- del analito y su unidad ya puestos, en vez de teclearlos uno por uno.
-- Eso es la mayor parte del trabajo de cargar un resultado.
--
-- QUÉ SE CARGÓ Y QUÉ NO, Y POR QUÉ
--
-- 35 exámenes y 188 analitos. De esos, 96 traen su valor de
-- referencia y 92 vienen en blanco. **Eso es a propósito.**
--
-- El rango solo se cargó cuando la cabecera de la propia hoja señalaba la
-- columna: «VALOR DE REFERENCIA» encima de esa columna exacta. Se intentó
-- deducirlo cuando la cabecera no estaba —por cuál columna parecía tener
-- rangos— y en las hojas que llevan un panel de referencia al costado el
-- panel le ganaba a la columna de verdad: la ferritina salía con el rango
-- de la testosterona femenina y el PSA con el de la glicemia. Un rango
-- equivocado al lado de un resultado, impreso y entregado a un paciente,
-- es la única manera en que esta pieza puede hacer daño. Así que no se
-- deduce: o lo dice su cabecera, o queda vacío y lo escribe quien mide,
-- que es lo que hace hoy.
--
-- ORINA y HECES quedaron afuera. No son una tabla de analito-unidad-rango:
-- son formularios de dos mitades, macroscópico y microscópico, con listas
-- de opciones al costado. Leerlos por columna emparejaba «ASPECTO» con
-- «0 - 2 x CMP», que es el rango de los leucocitos del microscópico.
--
-- TRES COSAS DEL PROPIO ARCHIVO QUE CONVIENE QUE ÉL ARREGLE
--
--   1. QUIMICA COMPLETA: el rango de la creatinina está partido en dos
--      filas, así que el ácido úrico se queda con «0,6 - 1,1 MUJERES», que
--      es de la creatinina, y el ácido úrico de verdad aparece repetido
--      abajo.
--   2. HEMA: VCM, HCM y CHCM están dos veces, con rangos distintos
--      (CHCM 32-36 gr/dl y CHCM 31,0-36,0 mg/dl).
--   3. QUIMICA RUTINA: la bilirrubina total no tiene rango.
--
-- Se cargó tal cual, sin corregir nada: es su archivo y es él quien decide
-- cuál de los dos valores vale.
--
-- Nada de esto se imprime sin que una persona lo mire: el rango cae en un
-- campo editable al lado del valor que el bioanalista está tecleando, y
-- firma después.

CREATE TABLE plantilla_examen (
  examen     text NOT NULL,
  -- El orden en que van los renglones, como en su hoja.
  orden      integer NOT NULL,
  analito    text NOT NULL,
  unidad     text NOT NULL DEFAULT '',
  referencia text NOT NULL DEFAULT '',
  PRIMARY KEY (examen, orden)
);

COMMENT ON TABLE plantilla_examen IS
  'Sacado de LABORATORIO CA.xls del cliente. Un rango vacío significa que su hoja no lo decía en una columna rotulada, no que no exista.';

INSERT INTO plantilla_examen (examen, orden, analito, unidad, referencia) VALUES
  ('DEPU.', 1, 'DEPURACION DE CREATININA', '', ''),
  ('DEPU.', 2, 'CARACTERES FISICOS:', '', ''),
  ('DEPU.', 3, 'Volumen de Orina/ 24 hrs:', '', ''),
  ('DEPU.', 4, 'Volumen de Orina/ min', '', ''),
  ('DEPU.', 5, 'Densidad urinaria:', '', ''),
  ('DEPU.', 6, 'Ph:', '', ''),
  ('DEPU.', 7, 'Color:', '', ''),
  ('DEPU.', 8, 'ANALISIS QUIMICO:', '', ''),
  ('DEPU.', 9, 'Creatinina Sérica', '', ''),
  ('DEPU.', 10, 'Creatinina en Orina', '', ''),
  ('DEPU.', 11, 'Depuración de creatinina', '', ''),
  ('DEPU.', 12, 'OTRAS DETERMINACIONES:', '', ''),
  ('DEPU.', 13, 'Proteinuria Cuantitativa en 24 Hrs', '', ''),
  ('DEPU.', 14, 'Proteinuria Cualitativa', '', ''),
  ('URO1', 1, 'TIPO DE MUESTRA:', '', ''),
  ('URO1', 2, 'EXAMEN SOLICITADO:', '', ''),
  ('URO1', 3, 'Fecha de entrada:', '', ''),
  ('URO1', 4, 'GRAM: restos celulares moderados.', '', ''),
  ('URO1', 5, 'RESULTADOS', '', ''),
  ('URO1', 6, 'CULTIVO', '', ''),
  ('PSA T Y L.', 1, 'PSA TOTAL', 'mg/dl', ''),
  ('PSA T Y L.', 2, 'PSA LIBRE', 'mg/dl', ''),
  ('DENGUE', 1, 'Dengue Blott (Ig M)', '', ''),
  ('DENGUE', 2, 'Dengue Blott (Ig G)', '', ''),
  ('GOTA GRUESA', 1, 'GOTA GRUESA', '', ''),
  ('HELICOBACTER IgM-IgG', 1, 'Helicobacter pylori IgG', '', ''),
  ('HELICOBACTER IgM-IgG', 2, 'Helicobacter pylori IgM', '', ''),
  ('HELICOTEST', 1, 'Helicobacter pylori (Prueba rápida)', '', ''),
  ('B-HCG CUANTIFICADA', 1, 'BHCG CUANTITATIVA', 'mUl/ml', ''),
  ('MARCADORES TUMORALES', 1, 'ALFA-FETOPROTEÍNA (AFP)', 'mg/ml', '1,0 - 7,0'),
  ('MARCADORES TUMORALES', 2, 'ANTÍGENO CARCINOEMBRIONARIO (CEA)', 'ng/dl', 'No fumadores 0 - 10 / Fumadores 0 - 4,5'),
  ('MARCADORES TUMORALES', 3, 'CA 125', 'U/ml', '0 - 46'),
  ('MARCADORES TUMORALES', 4, 'CA 15-3', 'ng/ml', '0,00 - 4,20'),
  ('MARCADORES TUMORALES', 5, 'CA 19-9', 'ng/dl', '0 - 32'),
  ('TESTOSTERONA, DHEA', 1, 'TESTOSTERONA TOTAL', 'ng/dl', 'Hombres: 241 - 827 / Mujeres: 14 - 76'),
  ('TESTOSTERONA, DHEA', 2, 'TESTOSTERONA LIBRE', 'ng/dl', 'Hombres: 8,0 - 12 / Mujeres: 0,89 - 2,2'),
  ('TESTOSTERONA, DHEA', 3, 'DHEA', 'ug/L', '2,0 - 15'),
  ('TESTOSTERONA, DHEA', 4, 'DHEA - SO 4', 'ng/dl', 'Hombres: 80 - 560 / Mujer: 35 - 430'),
  ('FSH, PROLACTINA', 1, 'HORMONA FOLICULOESTIMULANTE (FSH)', 'mUI/ml', 'Fase Folicular: 2,5 - 10,2 / Mitad de Ciclo: 3,4 - 33,4 / Fase Lútea: 1,5 - 9,1 / Embarazo: < 0,1 - 1,5 / Post-menospausia: 23 - 116,3 / Hombres (20-70 años): 1,4 - 18,1'),
  ('FSH, PROLACTINA', 2, 'PROLACTINA (PRL)', 'ng/ml', 'Mujeres no embarazadas: 2,8 - 29,2 / Embarazadas: 9,7 - 208,5 / Post - menospausia: 1,8 - 20,3 / Hombres: 2,1 - 17,7'),
  ('LH', 1, 'HORMONA LUTEINIZANTE (LH)', 'mUI/ml', 'Fase Folicular: 1,9 - 12,5 / Mitad de Ciclo: 8,7 - 76,3 / Fase Lútea: 0,5 - 16,9 / Embarazo: < 0,1 - 1,5 / Post-menospausia: 15,9 - 54 / Contraconceptivos: 0,7 - 5,6 / Hombre (niños): 0,1 - 6 / Hombres (20-70 años): 1,5 - 9,3'),
  ('ESTRADIOL, PROGESTERONA', 1, 'ESTRADIOL (E2)', 'pg/ml', 'Fase Folicular: / Mitad de Ciclo / Fase Lútea / Hombres:'),
  ('ESTRADIOL, PROGESTERONA', 2, 'PROGESTERONA', 'ng/ml', 'Fase Folicular: / Fase Lútea: / Fase Lútea Media: 4,44 - 28,03 / Post-menospausia: ND - 0,73 / Hombres:'),
  ('PERFIL TIROIDEO', 1, 'TSHus', '', '0,4 - 5,5 mUI/ml'),
  ('PERFIL TIROIDEO', 2, 'T 3 total', '', '80 - 200 pg/ml'),
  ('PERFIL TIROIDEO', 3, 'T 3 libre', '', '2,8 - 7,3 pmol/l'),
  ('PERFIL TIROIDEO', 4, 'T 4 total', '', '4,5 - 12 ng/dl'),
  ('PERFIL TIROIDEO', 5, 'T 4 libre', '', '8,5 - 22,5 pmol/l'),
  ('PERFIL TIROIDEO', 6, 'ANTICUERPOS ANTI-PEROXIDASA', '', '0 - 4 ng/ml'),
  ('PERFIL TIROIDEO', 7, 'TIROGLOBULINA', '', '0,0 - 33 ,0 ng/ml'),
  ('HIERRO,  PERFIL FERREPENICO', 1, 'FERRITINA', 'ng/ml', ''),
  ('HIERRO,  PERFIL FERREPENICO', 2, 'HIERRO SÉRICO', 'ug/dl', '60 - 150'),
  ('HIERRO,  PERFIL FERREPENICO', 3, 'TIBC', 'ug/dl', '250 - 350'),
  ('HIERRO,  PERFIL FERREPENICO', 4, '% Sat.', '', '13 - 23%'),
  ('HIERRO,  PERFIL FERREPENICO', 5, 'TRANSFERRINA', '', '150 - 320 (MUJERES) / 170 - 370 (HOMBRES)'),
  ('PCR Y RA TEST CUANT', 1, 'RA TEST CUANTITATIVO', 'mg/dl', '0,0 - 6,0'),
  ('PCR Y RA TEST CUANT', 2, 'PCR ULTRASENSIBLE', 'mg/dl', '0,0 - 6,0'),
  ('TOXO', 1, 'TOXOPLASMA (IgM)', 'mg/dl', '60 - 220'),
  ('TOXO', 2, 'TOXOPLASMA (IgG)', 'mg/dl', '600 -2000'),
  ('TOXO (2)', 1, 'TOXOPLASMA (IgM)', '', 'NEGATIVO < 0,9 / INDETERMINADO < 0,91 - 0,99'),
  ('TOXO (2)', 2, 'TOXOPLASMA (IgG)', '', 'POSITIVO > 1,0'),
  ('HEPATITIS', 1, 'MARCADORES VIRALES', '', ''),
  ('HEPATITIS', 2, 'MARCADORES VIRALES para HEPATITIS A:', '', ''),
  ('HEPATITIS', 3, 'HEPATITIS A ( IgG )', '', ''),
  ('HEPATITIS', 4, 'HEPATITIS A ( IgM )', '', ''),
  ('HEPATITIS', 5, 'MARCADORES VIRALES para HEPATITIS B:', '', ''),
  ('HEPATITIS', 6, 'ANTIGENO AUSTRALIA (HbsAg)', '', ''),
  ('HEPATITIS', 7, 'ANTICUERPOS ANTI-CORE (Anti-HBc.)', '', ''),
  ('HEPATITIS', 8, 'MARCADORES VIRALES para HEPATITIS C:', '', ''),
  ('FOSF-AMIL-LDH-CKT-CKMB', 1, 'FOSFATASA ALCALINA', 'U/L', 'Edad < 2 → 25 - 500 / Edad 2 - 9 → 100 - 400 / Edad 10 - 19 → 60 - 350 / Edad 20 - 39 → 40 - 180 / Edad 40 - 69 → 35 - 123'),
  ('FOSF-AMIL-LDH-CKT-CKMB', 2, 'AMILASA', 'U/L', '6 - 120'),
  ('FOSF-AMIL-LDH-CKT-CKMB', 3, 'LDH', 'U/L', '100 - 190'),
  ('FOSF-AMIL-LDH-CKT-CKMB', 4, 'CK TOTAL', 'U/L', '24 - 170'),
  ('FOSF-AMIL-LDH-CKT-CKMB', 5, 'CK-MB', 'U/L', '0 - 25'),
  ('PERFIL LIPIDICO', 1, 'COLESTEROL TOTAL', 'mg/dl', 'HASTA 200'),
  ('PERFIL LIPIDICO', 2, 'HDL-COLESTEROL', 'mg/dl', '> 40'),
  ('PERFIL LIPIDICO', 3, 'LDL-COLESTEROL', 'mg/dl', '< 130'),
  ('PERFIL LIPIDICO', 4, 'VLDL-COLESTEROL', 'mg/dl', 'HASTA 40'),
  ('PERFIL LIPIDICO', 5, 'TRIGLICERIDOS', 'mg/dl', '< 150'),
  ('ELECTROLITOS', 1, 'SODIO (Na)', 'mEq/L', ''),
  ('ELECTROLITOS', 2, 'POTASIO (K)', 'mEq/L', ''),
  ('ELECTROLITOS', 3, 'CLORO (Cl)', 'mEq/L', ''),
  ('ELECTROLITOS', 4, 'CALCIO (Ca)', 'mg/dl', ''),
  ('ELECTROLITOS', 5, 'FOSFORO (P)', 'mg/dl', ''),
  ('ELECTROLITOS', 6, 'MAGNESIO (Mg)', 'mEq/L', ''),
  ('TRANS-BIL-PROT', 1, 'TRANSAMINASA OXALACETICA', 'U/L', '8 - 40'),
  ('TRANS-BIL-PROT', 2, 'TRANSAMINASA PIRUVICA', 'U/L', '5 - 36'),
  ('TRANS-BIL-PROT', 3, 'GAMMA-GLUTAMIL TRANSFERASA', 'U/L', '0 - 60'),
  ('TRANS-BIL-PROT', 4, 'BILIRRUBINA TOTAL', 'mg/dl', '0.3 - 1.5'),
  ('TRANS-BIL-PROT', 5, 'BILIRRUBINA DIRECTA', 'mg/dl', 'HASTA 0.3'),
  ('TRANS-BIL-PROT', 6, 'BILIRRUBINA INDIRECTA', 'mg/dl', '0.2 - 0.8'),
  ('TRANS-BIL-PROT', 7, 'PROTEINAS TOTALES', 'g/dl', '6,3 - 8,5'),
  ('TRANS-BIL-PROT', 8, 'ALBUMINA', 'g/dl', '3,5 - 4,8'),
  ('TRANS-BIL-PROT', 9, 'GLOBULINAS', 'g/dl', '2,4 - 3,2'),
  ('TRANS-BIL-PROT', 10, 'RELACION A /G', 'g/dl', '1,2 - 2,2'),
  ('TRANS-PROT-AMIL-Ca-P', 1, 'TRANSAMINASA OXALACETICA', 'U/L', '8 - 40'),
  ('TRANS-PROT-AMIL-Ca-P', 2, 'TRANSAMINASA PIRUVICA', 'U/L', '5 - 36'),
  ('TRANS-PROT-AMIL-Ca-P', 3, 'PROTEINAS TOTALES', 'g/dl', '6,3 - 8,5'),
  ('TRANS-PROT-AMIL-Ca-P', 4, 'ALBUMINA', 'g/dl', '3,5 - 4,8'),
  ('TRANS-PROT-AMIL-Ca-P', 5, 'GLOBULINAS', 'g/dl', '2,4 - 3,2'),
  ('TRANS-PROT-AMIL-Ca-P', 6, 'RELACION A /G', 'g/dl', '1,2 - 2,2'),
  ('TRANS-PROT-AMIL-Ca-P', 7, 'AMILASA', 'U/L', '6 - 120'),
  ('TRANS-PROT-AMIL-Ca-P', 8, 'CALCIO (Ca)', 'mg/dl', '8,5 - 10,5'),
  ('TRANS-PROT-AMIL-Ca-P', 9, 'FOSFORO (P)', 'mg/dl', 'Adultos 2.5 - 4.8 / Niños 4.0 - 7.0'),
  ('PROT', 1, 'PROTEINAS TOTALES', 'g/dl', '6,3 - 8.5'),
  ('PROT', 2, 'ALBUMINA', 'g/dl', '3,5 - 4,8'),
  ('PROT', 3, 'GLOBULINA', 'g/dl', '2.4 - 3.2'),
  ('PROT', 4, 'RELACION A/G', 'g/dl', '1,2 - 2,2'),
  ('QUIMICA COMPLETA', 1, 'GLICEMIA', 'mg/dl', '65- 99'),
  ('QUIMICA COMPLETA', 2, 'COLESTEROL TOTAL', 'mg/dl', '< 200'),
  ('QUIMICA COMPLETA', 3, 'HDL-COLESTEROL', 'mg/dl', '> 40'),
  ('QUIMICA COMPLETA', 4, 'LDL-COLESTEROL', 'mg/dl', '< 130'),
  ('QUIMICA COMPLETA', 5, 'VLDL-COLESTEROL', 'mg/dl', 'HASTA 40'),
  ('QUIMICA COMPLETA', 6, 'TRIGLICERIDOS', 'mg/dl', '< 150'),
  ('QUIMICA COMPLETA', 7, 'UREA', 'mg/dl', '10 - 50'),
  ('QUIMICA COMPLETA', 8, 'CREATININA', 'mg/dl', '0,7 - 1,3 HOMBRES'),
  ('QUIMICA COMPLETA', 9, 'ACIDO URICO', 'mg/dl', '0,6 - 1,1 MUJERES'),
  ('QUIMICA COMPLETA', 10, 'ACIDO URICO', '', 'HOMBRES 2,5 - 6,2 / MUJERES 3,7 - 7,7'),
  ('QUIMICA RUTINA', 1, 'GLICEMIA', 'mg/dl', '70 - 99'),
  ('QUIMICA RUTINA', 2, 'COLESTEROL TOTAL', 'mg/dl', '< 200'),
  ('QUIMICA RUTINA', 3, 'TRIGLICERIDOS', 'mg/dl', '< 150'),
  ('QUIMICA RUTINA', 4, 'UREA', 'mg/dl', '10 - 50'),
  ('QUIMICA RUTINA', 5, 'CREATININA', 'mg/dl', '0,6 - 1,3'),
  ('QUIMICA RUTINA', 6, 'ACIDO URICO', 'mg/dl', 'HOMBRES: 2,5 - 6,2 / MUJERES: 3,7 - 7,7'),
  ('QUIMICA RUTINA', 7, 'ALT/ GPT', 'U/L', 'H < 45'),
  ('QUIMICA RUTINA', 8, 'AST/TGO', 'U/L', 'H < 35'),
  ('QUIMICA RUTINA', 9, 'BILIRRUBINA TOTAL', 'mg/dl', ''),
  ('QUIMICA RUTINA', 10, 'BILIRRUBINA DIRECTA', 'mg/dl', 'HASTA 0,3'),
  ('QUIMICA RUTINA', 11, 'BILIRRUBINA INDIRECTA', 'mg/dl', '0,2 - 0,8'),
  ('QUIMICA PREOP.', 1, 'GLICEMIA', 'mg/dl', '65 - 99'),
  ('QUIMICA PREOP.', 2, 'UREA', 'mg/dl', '10 - 50'),
  ('QUIMICA PREOP.', 3, 'CREATININA', 'mg/dl', '0,6- 1,3'),
  ('QUIMICA PREOP.', 4, 'DETERMINACION DE H.I.V 1/2', '', ''),
  ('QUIMICA PREOP.', 5, 'DETERMINACION DE V.D.R.L', '', ''),
  ('QUIMICA PREOP.', 6, 'GRUPO SANGUINEO', '', ''),
  ('QUIMICA PREOP.', 7, 'FACTOR Rh', '', ''),
  ('ESPECIAL DE GLICEMIA', 1, 'GLICEMIA BASAL', 'mg/dl', '70 - 110'),
  ('ESPECIAL DE GLICEMIA', 2, 'GLICEMIA POSPRANDIAL', 'mg/dl', 'Menos de 140'),
  ('ESPECIAL DE GLICEMIA', 3, 'INSULINA BASAL', 'ng/ml', '4,3 - 12,0'),
  ('ESPECIAL DE GLICEMIA', 4, 'INSULINA POSPRANDIAL', 'ng/ml', '18 - 276'),
  ('ESPECIAL DE GLICEMIA', 5, 'HEMOGLOBINA GLICADA (HbA1c)', '%', '4,0-6,3'),
  ('HEMA', 1, 'HEMOGLOBINA', 'gr/dl', ''),
  ('HEMA', 2, 'HEMATOCRITO', '%', ''),
  ('HEMA', 3, 'VCM', 'fl', '82 - 92'),
  ('HEMA', 4, 'HCM', 'pg', '27 - 32'),
  ('HEMA', 5, 'CHCM', 'gr/dl', '32 - 36'),
  ('HEMA', 6, 'ERITROCITOS', '10°/L', ''),
  ('HEMA', 7, 'VCM', 'fl', ''),
  ('HEMA', 8, 'HCM', 'pg', ''),
  ('HEMA', 9, 'CHCM', 'mg/dl', '31,0 - 36,0'),
  ('HEMA', 10, 'PLAQUETAS', 'X mm3', ''),
  ('HEMA', 11, 'LEUCOCITOS', 'X mm3', ''),
  ('HEMA', 12, 'SEGMENTADOS', '%', ''),
  ('HEMA', 13, 'LINFOCITOS', '%', ''),
  ('HEMA', 14, 'EOSINOFILOS', '%', ''),
  ('HEMA', 15, 'MONOCITOS', '%', ''),
  ('TIPIAJE-VSG', 1, 'TIPIAJE', '', ''),
  ('TIPIAJE-VSG', 2, 'Velocidad de Sedimentación Globular (VSG)', 'mm/h', ''),
  ('PBA.EMB Y OTRAS CUALI', 1, 'PRUEBA DE EMBARAZO EN SANGRE', '', ''),
  ('PBA.EMB Y OTRAS CUALI', 2, 'RA TEST CUALITATIVA', '', ''),
  ('PBA.EMB Y OTRAS CUALI', 3, 'VELOCIDAD DE SEDIMENTACION GLOBULAR (VSG)', '', ''),
  ('H. ESP', 1, 'ANALISIS MACROSCOPICO', 'mg/dl', ''),
  ('H. ESP', 2, 'ASPECTO', 'mg/dl', ''),
  ('H. ESP', 3, 'COLOR', 'mg/dl', ''),
  ('H. ESP', 4, 'CONSISTENCIA', 'mg/dl', ''),
  ('H. ESP', 5, 'MOCO', 'mg/dl', ''),
  ('H. ESP', 6, 'SANGRE', 'mg/dl', ''),
  ('H. ESP', 7, 'RESIDUOS', 'mg/dl', ''),
  ('H. ESP', 8, 'ANALISIS MICROSCOPICO:', '', ''),
  ('H. ESP', 9, 'NO SE OBSERVARON PARASITOS NI SUS FORMAS EVOLUTIVAS', '', ''),
  ('H. ESP', 10, 'Restos de Almidón: Escasos', '', ''),
  ('H. ESP', 11, 'Leucocitos:', '', ''),
  ('H. ESP', 12, 'Hematíes:', 'U/L', ''),
  ('HIV-VDRL-TIPIAJE', 1, 'H.I.V', '', ''),
  ('HIV-VDRL-TIPIAJE', 2, 'VDRL', '', ''),
  ('HIV-VDRL-TIPIAJE', 3, 'GRUPO SANGUINEO', '', ''),
  ('HIV-VDRL-TIPIAJE', 4, 'FACTOR Rh', '', ''),
  ('COAG.', 1, 'TIEMPO DE PROTROMBINA:', '', ''),
  ('COAG.', 2, 'TIEMPO CONTROL', '', ''),
  ('COAG.', 3, 'TIEMPO PACIENTE', '', ''),
  ('COAG.', 4, 'ACTIVIDAD', '', ''),
  ('COAG.', 5, 'RAZON P/C:', '', ''),
  ('COAG.', 6, 'INR', '', ''),
  ('COAG.', 7, 'TIEMPO DE TROMBOPLASTINA PARCIAL ACTIVADA', '', ''),
  ('COAG.', 8, 'TIEMPO CONTROL', '', ''),
  ('COAG.', 9, 'TIEMPO PACIENTE', '', ''),
  ('COAG.', 10, 'DIFERENCIA P-C', '', ''),
  ('COAG.', 11, 'FIBRINOGENO', '', '');
