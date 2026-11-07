-- Pacientes sin cédula.
--
-- No todo el mundo llega con cédula: extranjeros con pasaporte, recién
-- nacidos que todavía no tienen una, y el caso que de verdad importa,
-- alguien que llega inconsciente a una emergencia sin nada encima. Negarse a
-- registrar la atención hasta que aparezca un documento no es una opción.
--
-- DECISIÓN 1: la columna NO se hace nulable.
--
-- La alternativa era permitir cedula NULL, y se descartó por dos razones.
-- Una, la columna es UNIQUE y en Postgres varios NULL no chocan entre sí,
-- así que cada paciente sin documento sería invisible para la deduplicación
-- y el sistema no podría avisar que ya lo conoce. Dos, media aplicación
-- consulta por esa columna dando por hecho que tiene valor.
--
-- En su lugar la columna guarda CUALQUIER identificador y una columna nueva
-- dice de qué tipo es. Al que no trae nada se le asigna uno interno
-- correlativo (SD-000001), que sirve para colgarle la atención hoy y para
-- reconocerlo si vuelve mañana.
--
-- DECISIÓN 2: la llave de búsqueda lleva prefijo, salvo la cédula.
--
-- cedula_busca es única. Un pasaporte de puros números —los hay— se
-- normalizaría igual que una cédula y chocaría con una persona distinta. Por
-- eso cada tipo que no es cédula va prefijado: P: pasaporte, N: partida,
-- SD: interno. La cédula se queda sin prefijo, con sus dígitos pelados, para
-- que todo lo ya guardado y todas las consultas que existen sigan igual.
--
-- Esto es aditivo a propósito: nada de lo que ya funciona se toca.

CREATE TYPE tipo_documento AS ENUM (
  'cedula',     -- V o E: el caso normal
  'pasaporte',  -- extranjero de paso
  'partida',    -- partida de nacimiento, para recién nacidos
  'interno'     -- no trae documento: el número lo pone el sistema
);

ALTER TABLE paciente
  ADD COLUMN tipo_doc tipo_documento NOT NULL DEFAULT 'cedula';

-- Los que ya están cargados entraron todos por el camino de la cédula.
COMMENT ON COLUMN paciente.tipo_doc IS
  'Qué es lo que hay en cedula. Las filas anteriores a esta migración son todas cédulas.';

COMMENT ON COLUMN paciente.cedula IS
  'El documento tal como se escribió. Cédula, pasaporte, partida o uno interno; tipo_doc dice cuál.';

COMMENT ON COLUMN paciente.cedula_busca IS
  'El documento normalizado para buscar. La cédula va con sus dígitos pelados; el resto con prefijo (P:, N:, SD:) para que un pasaporte numérico no choque con una cédula.';

-- Correlativo de los documentos internos. Va en la base y no en la
-- aplicación: dos emergencias simultáneas no pueden sacar el mismo número.
CREATE SEQUENCE paciente_interno_seq;

COMMENT ON SEQUENCE paciente_interno_seq IS
  'Numera a los pacientes que llegaron sin documento: SD-000001, SD-000002...';

-- Para encontrar rápido a los que esperan que aparezca su documento.
CREATE INDEX paciente_sin_documento_idx ON paciente (tipo_doc) WHERE tipo_doc <> 'cedula';
