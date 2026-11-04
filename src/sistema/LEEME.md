# Sistema interno

Lo que el cliente describió en las notas de voz: el médico llena la historia en
una tablet, se imprime el documento de dos páginas, y al cierre del mes se sabe
qué se hizo y a quién cobrárselo.

**Privado.** Vive bajo `/sistema/`, detrás de login, con `noindex` y bloqueado
en `robots.txt`. No hay portal de pacientes: lo usa solo el personal.

## Lo que ya está

- `historia.ts` — el modelo del formulario, sacado del papel que usan hoy y
  recortado como pidió el cliente: fuera los campos de estado del servicio que
  pertenecen a la red de asistencia, no a la clínica.
- `base/001-inicial.sql` — el esquema. Probado contra Postgres 16: las siete
  tablas se crean y el cierre del mes devuelve lo esperado.

## Decisiones que ya están tomadas

**Los campos clínicos van en `jsonb`, no en columnas.** Son sesenta y pico,
casi todos opcionales, y el formulario va a cambiar. El modelo manda desde
`historia.ts`; la base guarda lo que se escribió.

**Nada se borra.** Una atención se anula con motivo y autor; no se elimina.
Toda lectura y escritura queda en `bitacora`. En datos de salud esto no es
opcional.

**El precio se copia al renglón.** Si mañana cambia la lista de servicios, lo
ya facturado no se mueve.

**El correlativo lo pone la base**, no la pantalla: el 555, 556, 557 que pidió
el cliente sale de una secuencia, no de contar filas.

## Lo que falta decidir con el cliente

1. Las plantillas Excel reales de cada aseguradora. La exportación es la función
   que justifica el sistema y no se puede inventar.
2. Lista de servicios con precio.
3. Cuántos usuarios y quiénes.
4. Si el contrato con la red de asistencia les permite llevar estos registros
   en un sistema propio.

## Lo que falta construir

Etapa 1 · login, formulario en tablet, guardar y reabrir, documento imprimible.
Etapa 2 · lista de casos tipo chat, ficha del paciente, búsqueda por mes.
Etapa 3 · renglones con pagador, cierre mensual, exportación a Excel.
Etapa 4 · funcionar sin internet y sincronizar, respaldos cifrados.
