-- Las unidades y los rangos que estaban en su archivo y no se habían leído,
-- y el VCM/HCM/CHCM duplicado de la hoja de hematología.
--
-- POR QUÉ FALTABAN
--
-- El primer pase leyó solo las tres columnas que la fila de cabecera de
-- cada hoja señalaba —PRUEBA, UNIDAD, VALOR DE REFERENCIAL— y hay hojas
-- que no tienen esa cabecera: coagulación arranca directo y depuración
-- pone la unidad pegada al valor. Ahí la unidad y el rango SÍ estaban
-- escritos, solo que en otra columna, y salieron en blanco.
--
-- Este pase los busca EN LA MISMA FILA del analito —la fila exacta que
-- anotó el extractor, no por nombre: en coagulación hay dos renglones
-- «TIEMPO CONTROL», y en depuración el título de la hoja y uno de sus
-- analitos se llaman igual— y dentro de una ventana de 45 columnas. Los
-- paneles de referencia que cada hoja tiene al costado arrancan mucho más
-- a la derecha (BR, DE, DF); sin ese tope, la razón P/C se quedaba con
-- «HOMBRES: 27 - 78», que es el rango de otra prueba.
--
-- H. ESP, ORINA y HECES siguen afuera: son formularios de dos mitades y
-- el rango de una no es el de la otra.
--
-- LOS TRES QUE SE DEJARON AFUERA A MANO
--
-- Se revisaron los 52 hallazgos uno por uno y tres eran de la columna de
-- al lado, no de su fila:
--
--   B-HCG CUANTIFICADA  «10 - 30»   no es un rango de BHCG cuantitativa
--   % Sat.              «ug/dl»     un porcentaje no se mide en µg/dl
--   TRANSFERRINA        «ug/dl»     tampoco
--
-- Quedan en blanco. Los carga el laboratorio.

update plantilla_examen set unidad = 'ml/ 24 hrs' where examen = 'DEPU.' and orden = 3;
update plantilla_examen set unidad = 'ml/ min' where examen = 'DEPU.' and orden = 4;
update plantilla_examen set unidad = 'mg/dl' where examen = 'DEPU.' and orden = 9;
update plantilla_examen set unidad = 'gr /24 hrs', referencia = '0,6-2,0 gr / 24 Hrs.' where examen = 'DEPU.' and orden = 10;
update plantilla_examen set unidad = 'ml/min', referencia = '70 - 140 ml / min.' where examen = 'DEPU.' and orden = 11;
update plantilla_examen set unidad = 'gr / 24 hrs', referencia = 'Negativo hasta 0,015 gr/ 24 hrs' where examen = 'DEPU.' and orden = 13;
update plantilla_examen set referencia = '0-4' where examen = 'PSA T Y L.' and orden = 1;
update plantilla_examen set referencia = '0,05-0,25' where examen = 'PSA T Y L.' and orden = 2;
update plantilla_examen set referencia = 'NEGATIVO' where examen = 'DENGUE' and orden = 1;
update plantilla_examen set referencia = 'NEGATIVO' where examen = 'DENGUE' and orden = 2;
update plantilla_examen set referencia = 'NEGATIVO 1:2 DIL.' where examen = 'HELICOBACTER IgM-IgG' and orden = 1;
update plantilla_examen set referencia = 'NEGATIVO 1:2 DIL.' where examen = 'HELICOBACTER IgM-IgG' and orden = 2;
update plantilla_examen set referencia = 'NEGATIVO' where examen = 'HELICOTEST' and orden = 1;
update plantilla_examen set referencia = '11 - 306' where examen = 'HIERRO,  PERFIL FERREPENICO' and orden = 1;
update plantilla_examen set referencia = 'NEGATIVO' where examen = 'HEPATITIS' and orden = 3;
update plantilla_examen set referencia = 'NEGATIVO' where examen = 'HEPATITIS' and orden = 4;
update plantilla_examen set referencia = 'NEGATIVO' where examen = 'HEPATITIS' and orden = 6;
update plantilla_examen set referencia = 'NEGATIVO' where examen = 'HEPATITIS' and orden = 7;
update plantilla_examen set referencia = '135 - 145' where examen = 'ELECTROLITOS' and orden = 1;
update plantilla_examen set referencia = '3, 5 - 5,4' where examen = 'ELECTROLITOS' and orden = 2;
update plantilla_examen set referencia = '100 - 106' where examen = 'ELECTROLITOS' and orden = 3;
update plantilla_examen set referencia = '8,5 - 10,5' where examen = 'ELECTROLITOS' and orden = 4;
update plantilla_examen set referencia = 'Adultos 2.5 - 4.8' where examen = 'ELECTROLITOS' and orden = 5;
update plantilla_examen set referencia = '1.3 - 2.5' where examen = 'ELECTROLITOS' and orden = 6;
update plantilla_examen set referencia = 'NEGATIVO' where examen = 'QUIMICA PREOP.' and orden = 4;
update plantilla_examen set referencia = 'POSITIVO' where examen = 'QUIMICA PREOP.' and orden = 7;
update plantilla_examen set referencia = 'Hombre: 12-17 /Mujer: 11-15' where examen = 'HEMA' and orden = 1;
update plantilla_examen set referencia = 'Hombre: 40-52 / Mujer: 35-47' where examen = 'HEMA' and orden = 2;
update plantilla_examen set referencia = '3,50 - 6,0' where examen = 'HEMA' and orden = 6;
update plantilla_examen set referencia = '80 - 100' where examen = 'HEMA' and orden = 7;
update plantilla_examen set referencia = '27 - 31' where examen = 'HEMA' and orden = 8;
update plantilla_examen set referencia = '150.000 - 450.000' where examen = 'HEMA' and orden = 10;
update plantilla_examen set referencia = '4.500 - 10.000' where examen = 'HEMA' and orden = 11;
update plantilla_examen set referencia = '40 - 60 %' where examen = 'HEMA' and orden = 12;
update plantilla_examen set referencia = '20 - 40 %' where examen = 'HEMA' and orden = 13;
update plantilla_examen set referencia = '0 - 5 %' where examen = 'HEMA' and orden = 14;
update plantilla_examen set referencia = '0 - 10 %' where examen = 'HEMA' and orden = 15;
update plantilla_examen set referencia = '0 - 15' where examen = 'TIPIAJE-VSG' and orden = 2;
update plantilla_examen set referencia = 'NEGATIVO' where examen = 'PBA.EMB Y OTRAS CUALI' and orden = 1;
update plantilla_examen set referencia = 'NEGATIVO' where examen = 'PBA.EMB Y OTRAS CUALI' and orden = 2;
update plantilla_examen set referencia = '0 - 15 mm/h' where examen = 'PBA.EMB Y OTRAS CUALI' and orden = 3;
update plantilla_examen set referencia = 'NEGATIVO' where examen = 'HIV-VDRL-TIPIAJE' and orden = 1;
update plantilla_examen set referencia = 'POSITIVO' where examen = 'HIV-VDRL-TIPIAJE' and orden = 4;
update plantilla_examen set unidad = 'seg' where examen = 'COAG.' and orden = 2;
update plantilla_examen set unidad = 'seg' where examen = 'COAG.' and orden = 3;
update plantilla_examen set unidad = '%' where examen = 'COAG.' and orden = 4;
update plantilla_examen set unidad = 'seg' where examen = 'COAG.' and orden = 8;
update plantilla_examen set unidad = 'seg' where examen = 'COAG.' and orden = 9;
update plantilla_examen set unidad = 'mg/dl', referencia = '200 - 400 mg/dl' where examen = 'COAG.' and orden = 11;

-- EL VCM, EL HCM Y EL CHCM ESTABAN DOS VECES
--
-- Su hoja HEMA trae esos tres analitos duplicados, con rangos distintos y
-- con una de las dos parejas de fórmulas roto:
--
--   filas 15-17   VCM 82 - 92    HCM 27 - 32    CHCM 32 - 36 gr/dl
--   filas 19-21   VCM 80 - 100   HCM 27 - 31    CHCM 31,0 - 36,0 mg/dl
--
-- Las fórmulas que sirven son las del segundo bloque (hematocrito y
-- hemoglobina contra los eritrocitos); las del primero son relleno
-- (=BP25*10000000+3). Las unidades que sirven son las del primero: el
-- CHCM se informa en gr/dl, no en mg/dl.
--
-- Se queda UN bloque: el primero, con sus unidades, y se le deja su rango.
-- Los tres se calculan solos, así que de qué fila salían las fórmulas no
-- cambia nada. El otro par de rangos queda anotado acá arriba para que el
-- laboratorio diga cuál de los dos usa; mientras no lo diga, se informa el
-- que su propia hoja muestra primero.
delete from plantilla_examen where examen = 'HEMA' and orden in (7, 8, 9);

-- Y los que quedan se renumeran para que no queden huecos en el orden.
with ordenadas as (
  select ctid, row_number() over (order by orden) as nueva
  from plantilla_examen where examen = 'HEMA'
)
update plantilla_examen p set orden = o.nueva
from ordenadas o where p.ctid = o.ctid;

-- El doble por ciento de «0 - 5 %%», que es un dedazo de la hoja.
update plantilla_examen set referencia = replace(referencia, '%%', '%')
where referencia like '%\%\%%';
