-- Permisos que administración prende o apaga por rol de trabajo.
--
-- El negocio es familiar: la misma gente rota entre oficios. El paquete
-- base de cada rol vive en lib/permisos.ts y NO cambia; esta tabla guarda
-- solo las DESVIACIONES: una fila por cada permiso que el centro encendió
-- o apagó respecto al paquete. Sin fila, vale el paquete.
--
-- Administración no va acá: sus permisos son fijos en código y no se
-- prenden ni se apagan desde la pantalla.
--
-- Cada cambio queda en la bitácora (accion 'permisos_rol') con qué se
-- prendió o apagó, quién y cuándo.

create table if not exists rol_permiso (
  rol        text not null check (rol in ('medico', 'bioanalista', 'recepcionista')),
  permiso    text not null,
  valor      boolean not null,
  cambiado_por text not null references "user"(id),
  cambiado   timestamptz not null default now(),
  primary key (rol, permiso)
);

comment on table rol_permiso is
  'Desviaciones de permisos por rol de trabajo: lo que administración prendió o apagó respecto al paquete base. Sin fila vale el paquete.';
