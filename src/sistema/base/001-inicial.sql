-- Sistema interno de Atenmefa — esquema inicial.
--
-- Guarda historias clínicas de personas identificadas. Dos consecuencias que
-- mandan sobre el diseño de estas tablas:
--   · nada se borra: las atenciones se anulan con motivo, no se eliminan;
--   · todo acceso queda registrado en bitacora.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- usuarios

CREATE TYPE rol AS ENUM ('medico', 'administracion');

CREATE TABLE usuario (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario       text NOT NULL UNIQUE,
  nombre        text NOT NULL,
  rol           rol  NOT NULL,
  clave_hash    text NOT NULL,
  -- Lo que firma los documentos. Solo para rol medico.
  colegiatura   text,
  msds          text,
  activo        boolean NOT NULL DEFAULT true,
  creado        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sesion (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  expira    timestamptz NOT NULL,
  creado    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON sesion (usuario_id);
CREATE INDEX ON sesion (expira);

-- ---------------------------------------------------------------- pacientes
-- La cédula identifica, pero puede repetirse mal escrita. Se guarda
-- normalizada aparte para poder buscar sin depender de cómo la tipearon.

CREATE TABLE paciente (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula        text NOT NULL,
  cedula_busca  text NOT NULL,          -- solo dígitos, para buscar
  nombre        text NOT NULL,
  nombre_busca  text NOT NULL,          -- sin tildes, en minúscula
  telefono      text,
  sexo          text,
  nacimiento    date,
  creado        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cedula_busca)
);
CREATE INDEX ON paciente (nombre_busca text_pattern_ops);

-- ---------------------------------------------------------------- atenciones

CREATE TYPE estado_atencion AS ENUM ('borrador', 'cerrada', 'anulada');

CREATE TABLE atencion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- El correlativo que pidió el cliente: 555, 556, 557…
  numero       bigint GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1),
  paciente_id  uuid NOT NULL REFERENCES paciente(id),
  medico_id    uuid NOT NULL REFERENCES usuario(id),
  estado       estado_atencion NOT NULL DEFAULT 'borrador',
  fecha        date NOT NULL,
  -- Para agrupar el cierre del mes sin calcularlo en cada consulta.
  -- Es el primer día del mes, no un texto. Dos trampas acá: to_char depende
  -- del DateStyle de la sesión, y el cast implícito de date resuelve a la
  -- variante timestamptz de date_trunc, que es stable. Postgres rechaza las
  -- dos en una columna generada; el ::timestamp explícito toma la inmutable.
  periodo      date GENERATED ALWAYS AS (date_trunc('month', fecha::timestamp)::date) STORED,
  aseguradora  text,
  poliza       text,
  caso_numero  text,
  -- Los campos clínicos van acá: son muchos, opcionales y cambian con el
  -- formulario. El modelo vive en src/sistema/historia.ts, no en columnas.
  datos        jsonb NOT NULL DEFAULT '{}'::jsonb,
  anulada_por  uuid REFERENCES usuario(id),
  anulada_motivo text,
  creada       timestamptz NOT NULL DEFAULT now(),
  cerrada      timestamptz,
  CONSTRAINT anulacion_con_motivo
    CHECK (estado <> 'anulada' OR (anulada_por IS NOT NULL AND anulada_motivo IS NOT NULL))
);
CREATE INDEX ON atencion (paciente_id);
CREATE INDEX ON atencion (periodo, aseguradora);
CREATE INDEX ON atencion (fecha DESC);
CREATE UNIQUE INDEX ON atencion (numero);

-- ---------------------------------------------------------------- cobro
-- La pieza que el cliente describió con la metáfora de la bodega: fuiste por
-- la carne, pero el médico mandó también la sal y el adobo, y hay que saber
-- quién paga la sal. Cada renglón lleva su pagador.

CREATE TYPE paga_quien AS ENUM ('paciente', 'aseguradora', 'empresa');

CREATE TABLE servicio (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre    text NOT NULL,
  categoria text NOT NULL,              -- consulta, laboratorio, traslado…
  precio    numeric(14,2) NOT NULL DEFAULT 0,
  moneda    text NOT NULL DEFAULT 'USD',
  activo    boolean NOT NULL DEFAULT true
);

CREATE TABLE renglon (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atencion_id  uuid NOT NULL REFERENCES atencion(id) ON DELETE CASCADE,
  servicio_id  uuid REFERENCES servicio(id),
  -- Se copia el nombre y el precio del momento: si mañana cambia la lista,
  -- lo ya facturado no se mueve.
  descripcion  text NOT NULL,
  cantidad     numeric(10,2) NOT NULL DEFAULT 1,
  precio       numeric(14,2) NOT NULL,
  moneda       text NOT NULL DEFAULT 'USD',
  paga         paga_quien NOT NULL DEFAULT 'paciente',
  creado       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON renglon (atencion_id);

-- ---------------------------------------------------------------- bitácora
-- Quién vio o tocó qué historia. En datos de salud esto no es opcional.

CREATE TABLE bitacora (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  uuid REFERENCES usuario(id),
  accion      text NOT NULL,            -- vio, creo, edito, cerro, anulo, exporto
  atencion_id uuid REFERENCES atencion(id),
  detalle     jsonb,
  ip          inet,
  momento     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON bitacora (atencion_id, momento DESC);
CREATE INDEX ON bitacora (usuario_id, momento DESC);
