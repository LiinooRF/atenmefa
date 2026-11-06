-- Historias clínicas y cobro.
--
-- Guarda datos de salud de personas identificadas. Dos consecuencias que
-- mandan sobre estas tablas:
--   · nada se borra: las atenciones se anulan con motivo, no se eliminan;
--   · todo acceso queda en bitacora.
--
-- Los usuarios viven en la tabla "user" de Better Auth (001-auth.sql), por
-- eso las claves foráneas son text y no uuid.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE estado_atencion AS ENUM ('borrador', 'cerrada', 'anulada');
CREATE TYPE paga_quien AS ENUM ('paciente', 'aseguradora', 'empresa');

-- La cédula identifica, pero puede venir mal escrita. Se guarda
-- normalizada aparte para poder buscar sin depender de cómo la tipearon.
CREATE TABLE paciente (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula        text NOT NULL,
  cedula_busca  text NOT NULL UNIQUE,
  nombre        text NOT NULL,
  nombre_busca  text NOT NULL,
  telefono      text,
  sexo          text,
  nacimiento    date,
  creado        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX paciente_nombre_idx ON paciente (nombre_busca text_pattern_ops);

CREATE TABLE atencion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- El correlativo que pidió el cliente: 555, 556, 557…
  numero       bigint GENERATED ALWAYS AS IDENTITY,
  paciente_id  uuid NOT NULL REFERENCES paciente(id),
  medico_id    text NOT NULL REFERENCES "user"(id),
  estado       estado_atencion NOT NULL DEFAULT 'borrador',
  fecha        date NOT NULL,
  -- Primer día del mes, para el cierre mensual. Dos trampas: to_char
  -- depende del DateStyle de la sesión, y el cast implícito de date
  -- resuelve a la variante timestamptz de date_trunc, que es stable.
  -- Postgres rechaza ambas en una columna generada; ::timestamp toma la
  -- inmutable.
  periodo      date GENERATED ALWAYS AS (date_trunc('month', fecha::timestamp)::date) STORED,
  aseguradora  text,
  poliza       text,
  caso_numero  text,
  -- Los campos clínicos van acá: son más de sesenta, casi todos opcionales
  -- y el formulario cambia. El modelo manda desde src/sistema/historia.ts.
  datos        jsonb NOT NULL DEFAULT '{}'::jsonb,
  anulada_por  text REFERENCES "user"(id),
  anulada_motivo text,
  creada       timestamptz NOT NULL DEFAULT now(),
  cerrada      timestamptz,
  CONSTRAINT anulacion_con_motivo
    CHECK (estado <> 'anulada' OR (anulada_por IS NOT NULL AND anulada_motivo IS NOT NULL))
);
CREATE INDEX atencion_paciente_idx ON atencion (paciente_id);
CREATE INDEX atencion_periodo_idx  ON atencion (periodo, aseguradora);
CREATE INDEX atencion_fecha_idx    ON atencion (fecha DESC);
CREATE UNIQUE INDEX atencion_numero_idx ON atencion (numero);

CREATE TABLE servicio (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre    text NOT NULL,
  categoria text NOT NULL,
  precio    numeric(14,2) NOT NULL DEFAULT 0,
  moneda    text NOT NULL DEFAULT 'USD',
  activo    boolean NOT NULL DEFAULT true
);

-- La pieza que el cliente describió con la metáfora de la bodega: fuiste
-- por la carne, pero el médico mandó también la sal y el adobo, y hay que
-- saber quién paga la sal. Cada renglón lleva su pagador.
CREATE TABLE renglon (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atencion_id  uuid NOT NULL REFERENCES atencion(id) ON DELETE CASCADE,
  servicio_id  uuid REFERENCES servicio(id),
  -- Se copia nombre y precio del momento: si cambia la lista, lo ya
  -- facturado no se mueve.
  descripcion  text NOT NULL,
  cantidad     numeric(10,2) NOT NULL DEFAULT 1,
  precio       numeric(14,2) NOT NULL,
  moneda       text NOT NULL DEFAULT 'USD',
  paga         paga_quien NOT NULL DEFAULT 'paciente',
  creado       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX renglon_atencion_idx ON renglon (atencion_id);

-- Quién vio o tocó qué historia. En datos de salud no es opcional.
CREATE TABLE bitacora (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  text REFERENCES "user"(id),
  accion      text NOT NULL,
  atencion_id uuid REFERENCES atencion(id),
  detalle     jsonb,
  ip          inet,
  momento     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bitacora_atencion_idx ON bitacora (atencion_id, momento DESC);
CREATE INDEX bitacora_usuario_idx  ON bitacora (usuario_id, momento DESC);
