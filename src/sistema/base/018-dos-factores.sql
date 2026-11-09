-- Segundo factor con aplicación (TOTP) y códigos de respaldo.
--
-- POR QUÉ LA TABLA ENTERA Y A MANO
--
-- El complemento de Better Auth declara su propio esquema y lo da por
-- existente: si falta una sola columna, el que se cae NO es el segundo
-- factor sino el login completo, para todo el mundo, con un error que no
-- menciona la columna. Ya pasó en otro proyecto. Así que las seis columnas
-- van escritas acá, una por una, calcadas de `plugins/two-factor/schema.ts`:
--
--   secret                   el secreto TOTP, cifrado por el complemento
--   backupCodes              los códigos de respaldo, cifrados
--   userId                   de quién es
--   verified                 si terminó de activarlo escaneando el QR
--   failedVerificationCount  intentos fallidos seguidos
--   lockedUntil              hasta cuándo queda bloqueado
--
-- Los nombres de columna van en snake_case porque así los mapea el esquema
-- de Drizzle del proyecto (`email_verified`, `created_at`).
--
-- NACE APAGADO PARA TODOS
--
-- `two_factor_enabled` arranca en false. Prenderlo de golpe para el centro
-- entero dejaría a todos afuera a la mañana siguiente, incluido quien
-- tendría que arreglarlo. Cada uno lo activa desde Mi cuenta.
alter table "user"
  add column if not exists two_factor_enabled boolean not null default false;

create table if not exists two_factor (
  id text primary key,
  secret text not null,
  backup_codes text not null,
  user_id text not null references "user"(id) on delete cascade,
  verified boolean not null default true,
  failed_verification_count integer not null default 0,
  locked_until timestamp
);

create index if not exists two_factor_user_id_idx on two_factor (user_id);
create index if not exists two_factor_secret_idx on two_factor (secret);

comment on table two_factor is
  'Segundo factor por usuario. El secreto y los códigos de respaldo los cifra Better Auth con AUTH_SECRETO: cambiar ese secreto deja a todos sin segundo factor.';
