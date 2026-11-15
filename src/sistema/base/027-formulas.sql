-- LOS NÚMEROS DE LAS FÓRMULAS QUE DEPENDEN DEL REACTIVO
--
-- Las catorce cuentas del laboratorio viven en sistema/calculos.ts y su forma
-- no se cambia desde una pantalla: una fórmula mal escrita da resultados
-- equivocados en todos los informes sin que nadie lo note.
--
-- Pero tres números sí cambian con el laboratorio: el ISI del INR (1,17 el
-- reactivo de hoy), lo que se descuenta en la actividad protrombínica (7,2)
-- y el divisor del VLDL (5). Cuando cambian de lote o de marca, el
-- bioanalista los corrige en Laboratorio → Fórmulas. Acá se guarda el valor
-- que puso; si no hay fila, vale el de fábrica del código.

create table formula_constante (
  clave         text primary key,
  valor         numeric(10, 4) not null check (valor >= 0),
  cambiado_por  text not null references "user"(id),
  cambiado      timestamptz not null default now()
);

comment on table formula_constante is
  'El valor que el laboratorio le puso a un número ajustable de sus fórmulas (ISI, constantes). Sin fila, vale el del código.';
