-- Atenciones de laboratorio.
--
-- POR QUÉ LA MISMA TABLA Y NO UNA NUEVA
--
-- Una orden de laboratorio es una atención: tiene paciente, fecha, médico,
-- se le cargan renglones de cobro, entra en el cierre del mes y termina en
-- un documento. Todo eso ya existe y funciona. Una tabla aparte obligaría a
-- duplicar la lista de casos, la ficha del paciente, el cobro y el cierre,
-- y las dos copias se irían separando con cada cambio.
--
-- Lo único distinto es el formulario: el de laboratorio tiene dos pasos y no
-- nueve, porque no hay examen físico ni diagnóstico que escribir.
--
-- Las filas que ya estaban son todas de atención general, que es lo que el
-- centro venía registrando.

CREATE TYPE tipo_atencion AS ENUM ('general', 'laboratorio');

ALTER TABLE atencion
  ADD COLUMN tipo tipo_atencion NOT NULL DEFAULT 'general';

COMMENT ON COLUMN atencion.tipo IS
  'Qué formulario le toca. La atención general lleva la historia clínica completa; la de laboratorio, solo el registro y los exámenes.';

CREATE INDEX atencion_tipo_idx ON atencion (tipo, fecha DESC);
