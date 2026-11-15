-- LO QUE CONTESTÓ EL LABORATORIO (15-11-2026)
--
-- Se le mandó la lista de los 22 renglones que su archivo no traía con
-- rango ni con menú, y la devolvió llena en parte. Acá va lo que contestó,
-- tal como lo escribió. Lo que dejó pendiente —la depuración de creatinina,
-- «debo repasar ese tema», y los restos de almidón de H. ESP— no se toca.
--
-- Cada UPDATE pide también el nombre del renglón y no solo su número de
-- orden: si alguien ya reordenó la hoja desde la pantalla, no se escribe
-- el rango de un analito en otro.

-- BHCG: el rango depende de la semana de embarazo. Se imprime la tabla
-- entera; el sistema no la usa para marcar fuera de rango porque no sabe
-- de cuántas semanas va la paciente (ver sistema/rangos.ts).
update plantilla_examen set referencia =
  '1 SEMANA: 10 - 30 / 2 SEMANA: 30 - 100 / 3 SEMANA: 48 - 346 / '
  '4 SEMANA: 278 - 1073 / 5 SEMANA: 1010 - 10530 / 6 SEMANA: 11334 - 100154 / '
  '7 SEMANA: 16950 - 155450 / 8 SEMANA: 64200 - 258200 / '
  '9 SEMANA: 77800 - 304.000 / 3 MES: 26.000 - 244.000 / '
  'NO EMBARAZADAS: 0 - 10 / HOMBRES: 0 - 10'
where examen = 'B-HCG CUANTIFICADA' and orden = 1 and btrim(analito) = 'BHCG CUANTITATIVA';

-- COAGULACIÓN
--
-- El tiempo control es el del lote del reactivo, 12 segundos el del PT y
-- 32 el del PTT, y es el mismo en todas las órdenes: en su archivo viene
-- escrito ya en la columna del resultado. Va como menú de una sola opción,
-- para ponerlo de un toque, y no como rango.
update plantilla_examen set opciones = '12'
where examen = 'COAG.' and orden = 2 and btrim(analito) = 'TIEMPO CONTROL';
update plantilla_examen set opciones = '32'
where examen = 'COAG.' and orden = 8 and btrim(analito) = 'TIEMPO CONTROL';

-- La razón P/C había quedado como subtítulo y por eso nunca se calculaba.
-- Confirmaron la cuenta: tiempo del paciente ÷ tiempo control.
update plantilla_examen set tipo = 'analito'
where examen = 'COAG.' and orden = 5 and btrim(analito) = 'RAZON P/C:';

-- INR: el rango que mandaron. La fórmula, (TP/TC)^1,17, va en
-- sistema/calculos.ts.
update plantilla_examen set referencia = '0,8-1,2'
where examen = 'COAG.' and orden = 6 and btrim(analito) = 'INR';

-- GOTA GRUESA: sus cuatro respuestas, y la nota del período febril como
-- una selección aparte, «que vaya junto a la gota gruesa».
update plantilla_examen set opciones =
  E'No se observaron formas parasitarias compatibles con Plasmodium sp.\n'
  'Se observaron formas compatibles con Plasmodium vivax\n'
  'Se observaron formas parasitarias compatibles con Plasmodium falciparum\n'
  'Se observaron formas parasitarias compatibles con Plasmodium vivax y falciparum'
where examen = 'GOTA GRUESA' and orden = 1 and btrim(analito) = 'GOTA GRUESA';

insert into plantilla_examen (examen, orden, analito, unidad, referencia, tipo, opciones)
values ('GOTA GRUESA', 2, 'NOTA', '', '', 'analito',
  E'Nota: muestra tomada en periodo no febril\nNota: muestra tomada en periodo febril')
on conflict do nothing;

-- HIV, VDRL Y GRUPO SANGUÍNEO, en las dos hojas que los traen. El tipiaje
-- «es igual a grupo sanguíneo».
update plantilla_examen set opciones = E'POSITIVO\nNEGATIVO'
where (examen, orden) in (('HIV-VDRL-TIPIAJE', 1), ('QUIMICA PREOP.', 4))
  and btrim(analito) in ('H.I.V', 'DETERMINACION DE H.I.V 1/2');

update plantilla_examen set opciones = E'NO REACTIVO\nREACTIVO'
where (examen, orden) in (('HIV-VDRL-TIPIAJE', 2), ('QUIMICA PREOP.', 5))
  and btrim(analito) in ('VDRL', 'DETERMINACION DE V.D.R.L');

update plantilla_examen set opciones = E'O+\nO-\nA+\nA-\nB+\nB-\nAB+\nAB-'
where (examen, orden) in (('HIV-VDRL-TIPIAJE', 3), ('QUIMICA PREOP.', 6), ('TIPIAJE-VSG', 1))
  and btrim(analito) in ('GRUPO SANGUINEO', 'TIPIAJE');

-- BILIRRUBINA TOTAL de la química de rutina: el mismo rango que ya tenía
-- en la hoja de transaminasas.
update plantilla_examen set referencia = '0.3 - 1.5'
where examen = 'QUIMICA RUTINA' and orden = 9 and btrim(analito) = 'BILIRRUBINA TOTAL';

-- UROCULTIVO: «acá solo deja los títulos y se rellenan escritos». El
-- renglón del gram traía pegada una respuesta de ejemplo en el nombre.
update plantilla_examen set analito = 'GRAM'
where examen = 'URO1' and orden = 4 and btrim(analito) = 'GRAM: restos celulares moderados.';
