-- Un borrador se puede borrar, y el que nadie toca se borra solo.
--
-- Hasta acá no se borraba NADA: una atención cerrada se anula con motivo y
-- un borrador se quedaba para siempre. El cliente lo preguntó directo: «el
-- médico empieza una, no la termina… en borradores la puede borrar, igual
-- que el bioanalista», y después, «el admin puede borrar borradores, y si
-- no, se borran en 20 días».
--
-- POR QUÉ ESTO NO CONTRADICE "NADA SE BORRA"
--
-- Esa regla es sobre lo FIRMADO. Un borrador no tiene firma, no entró en el
-- cierre del mes, no se imprimió con PIN y no se le entregó a nadie: es una
-- pantalla que alguien abrió y dejó por la mitad. Lo que no se borra sigue
-- sin borrarse —una cerrada se anula con motivo y autor, como siempre—.
--
-- QUÉ CAMBIA ACÁ
--
-- Solo la llave foránea de la bitácora. Al borrar la atención, sus líneas de
-- bitácora quedaban colgadas de una fila que ya no existe y Postgres
-- rechazaba el borrado. Se ponen en NULL y no en CASCADE a propósito: el
-- rastro de quién vio y quién tocó no se va con la atención. La línea del
-- borrado se escribe DESPUÉS, con el número, el paciente y el autor
-- guardados en `detalle`, así que queda legible aunque ya no apunte a nada.
--
-- El borrado automático de los 20 días no vive en la base: es una consulta
-- en src/sistema/lib/atenciones.ts que corre cuando alguien abre los
-- borradores. No hay cron porque no hace falta uno: si nadie entra al
-- sistema en veinte días, tampoco le molesta el borrador.

ALTER TABLE bitacora DROP CONSTRAINT bitacora_atencion_id_fkey;
ALTER TABLE bitacora
  ADD CONSTRAINT bitacora_atencion_id_fkey
  FOREIGN KEY (atencion_id) REFERENCES atencion(id) ON DELETE SET NULL;

COMMENT ON COLUMN bitacora.atencion_id IS
  'Nulo si la atención se borró siendo borrador. Lo que decía queda en detalle.';
