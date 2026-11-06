-- Tablas de Better Auth.
--
-- OJO: tiene que estar el esquema COMPLETO, con los campos propios que
-- declara `user.additionalFields` en auth.ts. Si falta una columna, Better
-- Auth no avisa: falla el login entero.
--
-- Generado con `npx @better-auth/cli generate` y pasado a SQL a mano.
-- Al tocar la configuración de auth hay que regenerar y actualizar esto.

CREATE TABLE "user" (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  email          text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image          text,
  created_at     timestamp NOT NULL DEFAULT now(),
  updated_at     timestamp NOT NULL DEFAULT now(),
  -- propios del centro
  rol            text NOT NULL DEFAULT 'medico',
  colegiatura    text,
  msds           text,
  activo         boolean DEFAULT true,
  CONSTRAINT rol_valido CHECK (rol IN ('medico', 'administracion'))
);

CREATE TABLE session (
  id         text PRIMARY KEY,
  expires_at timestamp NOT NULL,
  token      text NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  user_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX session_userId_idx ON session (user_id);

CREATE TABLE account (
  id                       text PRIMARY KEY,
  account_id               text NOT NULL,
  provider_id              text NOT NULL,
  user_id                  text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token             text,
  refresh_token            text,
  id_token                 text,
  access_token_expires_at  timestamp,
  refresh_token_expires_at timestamp,
  scope                    text,
  password                 text,
  created_at               timestamp NOT NULL DEFAULT now(),
  updated_at               timestamp NOT NULL DEFAULT now()
);
CREATE INDEX account_userId_idx ON account (user_id);

CREATE TABLE verification (
  id         text PRIMARY KEY,
  identifier text NOT NULL,
  value      text NOT NULL,
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX verification_identifier_idx ON verification (identifier);
