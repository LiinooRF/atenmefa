-- EL CONTEO POR CAMPO (x CMP), COMO LO TRAE EL ARCHIVO
--
-- En la orina y en las heces, los leucocitos y los hematíes se informan
-- contando por campo del microscopio: «4 - 6 x CMP». El archivo del
-- laboratorio los elige de una lista de su hoja DAT. (columna Q), y acá se
-- escribían a mano. Ahora traen esa lista, copiada tal cual —con sus
-- repetidos quitados—, y se sigue pudiendo escribir otra cosa.
--
-- Y un error de la carga de la orina (021): bacterias, células planas y
-- mucina decían «ESCASAS / MODERADAS / ABUNDANTAS». En el archivo es
-- «ESCASAS x CMP / MODERADAS x CMP / ABUNDANTES x CMP» (hoja DAT.,
-- columna K). «ABUNDANTAS» no existe en el archivo.
--
-- Los cilindros no tienen lista en el archivo y quedan como estaban.

update plantilla_examen set opciones = E'0 - 1 x CMP\n0 - 2 x CMP\n1 - 3 x CMP\n2 - 4 x CMP\n3 - 5 x CMP\n4 - 6 x CMP\n6 - 8 x CMP\n7 - 9 x CMP\n8 - 10 x CMP\n10 - 12 x CMP\n13 - 15 x CMP\n14 - 16 x CMP\n18 - 20 x CMP\n17 - 20 x CMP\n20 - 25 x CMP\n20 - 23 x CMP\n28 - 30 x CMP\n30 - 35 x CMP\n37-40 x CMP\n40 - 45 x CMP\nMAS DE 50 x CMP\n55 - 60 x CMP\n60 - 65 x CMP\n65 - 70 x CMP\n70 - 75 x CMP\n75 - 80 x CMP\n80 - 85 x CMP\n85 - 90 x CMP\nMAS DE 100 x CMP'
where (examen = 'ORINA' and btrim(analito) in ('LEUCOCITOS', 'HEMATIES'))
   or (examen in ('HECES', 'H. ESP') and btrim(analito) in ('Leucocitos:', 'Hematíes:'));

update plantilla_examen set opciones = E'ESCASAS x CMP\nMODERADAS x CMP\nABUNDANTES x CMP'
where examen = 'ORINA' and btrim(analito) in ('BACTERIAS', 'CELULAS PLANAS', 'MUCINA');
