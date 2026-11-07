-- El registro de los respaldos.
--
-- POR QUÉ EN LA BASE Y NO EN UN ARCHIVO DE REGISTRO
--
-- El modo más común de perder datos no es quedarse sin respaldo: es creer
-- que hay uno. El servicio se cae, el disco se llena, cambia la clave de la
-- base, y las copias dejan de hacerse en silencio. Nadie mira los registros
-- de un contenedor hasta el día que hace falta restaurar, que es el peor día
-- para enterarse.
--
-- Guardarlo acá lo pone donde sí se mira: el panel muestra cuándo fue el
-- último respaldo bueno y grita si ya pasó más de un día.
--
-- La fila la escribe el servicio de respaldos, no la aplicación.

CREATE TABLE respaldo (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  momento  timestamptz NOT NULL DEFAULT now(),
  -- 'ok' solo después de descifrar la copia y leerle el índice: si no se
  -- pudo leer, no cuenta como respaldo.
  estado   text NOT NULL CHECK (estado IN ('ok', 'fallo')),
  archivo  text,
  bytes    bigint,
  detalle  text
);

CREATE INDEX respaldo_momento_idx ON respaldo (momento DESC);

COMMENT ON TABLE respaldo IS
  'Una fila por intento de respaldo. Lo escribe el servicio de respaldos para que el panel pueda avisar cuando dejan de hacerse.';
