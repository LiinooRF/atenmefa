-- Los cuatro roles, y el laboratorio colgado de la consulta que lo pidió.
--
-- El cliente lo definió en audio: «sería administrador, médico, bioanalista
-- y recepcionista». Hasta ahora había dos.
--
-- QUÉ HACE CADA UNO
--
--   · recepcionista — crea y actualiza al paciente, sus datos de contacto,
--     registra qué exámenes se le van a hacer y cobra. No lee historias
--     clínicas: para cobrar no hace falta saber el diagnóstico.
--   · bioanalista — «el licenciado». Carga los resultados del laboratorio y
--     los firma. No escribe historias clínicas; el médico no carga
--     resultados. Fue la distinción que el cliente pidió explícitamente.
--
-- POR QUÉ origen_id
--
-- El cliente dejó una pregunta abierta: «el paciente al que el médico le
-- había solicitado un examen, ¿se queda aparte o se anexa a la historia
-- médica?». Se anexa: la orden de laboratorio guarda de qué consulta salió.
-- Así una cosa y la otra:
--
--   · el que llega SOLO para un examen nunca aparece en las historias
--     médicas —no tiene origen, no es un caso del médico—;
--   · el que vino a consulta y salió con exámenes los tiene colgados de su
--     propia consulta, y el médico ve el resultado donde lo escribió.
--
-- POR QUÉ resultados_por Y NO medico_id
--
-- medico_id es quien REGISTRÓ la orden, que normalmente es recepción. Quien
-- firma los resultados es otro, y en un informe de laboratorio esa firma es
-- la que vale: lleva el nombre y el colegio del bioanalista. Dos columnas
-- porque son dos personas distintas.

ALTER TABLE "user" DROP CONSTRAINT rol_valido;
ALTER TABLE "user" ADD CONSTRAINT rol_valido
  CHECK (rol IN ('medico', 'administracion', 'bioanalista', 'recepcionista'));

ALTER TABLE atencion
  ADD COLUMN origen_id      uuid REFERENCES atencion(id) ON DELETE SET NULL,
  ADD COLUMN resultados     jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN resultados_por text REFERENCES "user"(id),
  ADD COLUMN resultados_en  timestamptz;

COMMENT ON COLUMN atencion.origen_id IS
  'La consulta que pidió estos exámenes. Nulo en el que llega solo al laboratorio.';
-- ON DELETE SET NULL y no CASCADE: si alguna vez se borra la consulta, el
-- resultado del laboratorio no se borra con ella. Es una medición que se le
-- hizo a una persona; queda, aunque se quede sin de dónde salió.
COMMENT ON COLUMN atencion.resultados IS
  'Un objeto por examen: qué se midió, cuánto dio, en qué unidad y su valor de referencia. Fuera de datos, que es plano.';
COMMENT ON COLUMN atencion.resultados_por IS
  'El bioanalista que cargó y firma los resultados. Distinto de medico_id, que es quien registró la orden.';

-- La cola del laboratorio pregunta siempre lo mismo: qué hay pendiente, lo
-- más viejo primero.
CREATE INDEX atencion_origen_idx ON atencion (origen_id) WHERE origen_id IS NOT NULL;
