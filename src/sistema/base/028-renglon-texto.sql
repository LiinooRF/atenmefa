-- UN RENGLÓN QUE ESCRIBE EL BIOANALISTA
--
-- Hasta ahora un renglón de plantilla era un analito —se le pone un número
-- o se elige de un menú, y tiene rango— o un subtítulo. Faltaba el tercero:
-- lo que el bioanalista redacta según lo que ve al microscopio. El gram y
-- el cultivo del urocultivo, el frotis. El laboratorio lo dijo así para el
-- urocultivo: «acá solo deja los títulos y se rellenan escritos».
--
-- Sin este tipo, esos renglones contaban como «le falta el rango» y la
-- pantalla de valores de referencia los pintaba de amarillo para siempre.
-- Un texto no tiene rango ni unidad, y en la pantalla de resultados se
-- escribe en un cuadro de varias líneas.

alter table plantilla_examen drop constraint if exists plantilla_examen_tipo_check;
alter table plantilla_examen
  add constraint plantilla_examen_tipo_check check (tipo in ('analito', 'titulo', 'texto'));

update plantilla_examen set tipo = 'texto', unidad = '', referencia = '', opciones = ''
where examen = 'URO1' and btrim(analito) in ('GRAM', 'CULTIVO') and tipo = 'analito';
