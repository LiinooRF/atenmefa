-- El sello estampado de quien firma el informe, junto a su firma (017).
--
-- La misma regla del proyecto: nada en el disco de la VPS. Una imagen
-- chica —una por usuario— como data URI, que viaja con el respaldo de la
-- base. El tope se valida en la aplicación antes de escribir.
--
-- El fondo blanco lo quita la aplicación al cargar (034: quitarFondoBlanco
-- en lib/imagenes.ts), para que el sello se vea estampado y no como una
-- foto pegada con cinta.

alter table "user"
  add column if not exists sello text;

comment on column "user".sello is
  'Foto del sello con el fondo blanco quitado (PNG transparente), como data URI. Sale estampado junto a la firma en el informe.';
