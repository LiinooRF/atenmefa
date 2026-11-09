-- La firma escaneada de quien firma el informe.
--
-- Hasta ahora el papel salía con el nombre y la matrícula sobre una línea
-- vacía, y había que firmarlo a mano uno por uno. En un laboratorio que
-- entrega veinte informes al día eso es media hora de firmar papeles.
--
-- SE GUARDA EN LA BASE Y NO COMO ARCHIVO, A PROPÓSITO
--
-- La regla del proyecto es que en el disco de la VPS no queda nada: ni
-- PDF, ni fotos. Una firma es una imagen chica —una por usuario, no una
-- por informe— así que entra como data URI en su propia fila y viaja con
-- el respaldo de la base. Si fuera un archivo habría que respaldarlo
-- aparte, y el día que se mude el servidor alguien se olvidaría.
--
-- El tope de 120 KB se valida en la aplicación antes de escribir: una
-- firma escaneada decente pesa menos de 30.
alter table "user"
  add column if not exists firma text;

comment on column "user".firma is
  'Firma escaneada como data URI (image/png o image/jpeg). Vacío = se imprime la línea para firmar a mano.';
