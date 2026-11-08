# Sistema interno

Lo que el cliente describió en las notas de voz: se registra a quién se atiende,
el médico llena la historia en una tablet, el laboratorio carga sus resultados,
se imprime el documento, y al cierre del mes se sabe qué se hizo y a quién
cobrárselo.

**Privado.** Vive bajo `/sistema/`, detrás de login, con `noindex` y bloqueado
en `robots.txt`. No hay portal de pacientes: lo usa solo el personal.

## Los cuatro roles

El cliente los definió así: «sería administrador, médico, bioanalista y
recepcionista». Quién puede qué vive en una sola tabla, `lib/permisos.ts`, y
toda la aplicación pregunta ahí.

| Rol | Qué hace |
|---|---|
| **Médico** | Atiende, firma la historia, pide exámenes y anota qué se le hizo. No carga resultados. |
| **Bioanalista** | «El licenciado». Carga los resultados del laboratorio y los firma con su colegio. No escribe historias clínicas. |
| **Recepción** | Registra y actualiza al paciente, marca qué exámenes se le van a hacer, y cobra. |
| **Administración** | Precios, cierre del mes, anulaciones, cuentas y bitácora. |

Los cuatro pueden **leer** la historia clínica y descargarla; el cliente lo
pidió explícito. Cada apertura queda en `bitacora`.

## El laboratorio

Son dos mitades y dos personas, como él lo describió: «el recepcionista va a
colocar el nombre del paciente, los exámenes que se va a hacer… y el propio
licenciado va a colocar, de esos exámenes, los resultados».

- La orden se registra en dos pasos y no nueve: no hay examen físico ni
  diagnóstico que escribir.
- **Marcar un examen ES cargarlo a la cuenta.** No hay una lista de lo que se
  le hace y otra de lo que se le cobra; el total se dice en dólares y en
  bolívares, con la tasa del BCV y su fecha.
- Los resultados son otra pantalla, `/sistema/atencion/<id>/resultados`, con
  una línea por valor —una hematología completa da varios— y su valor de
  referencia.
- La orden no se cierra desde recepción: la cierra el bioanalista cuando los
  resultados están listos.
- **El que llega solo al laboratorio no le aparece al médico.** «No tiene por
  qué esa persona salir en la sección de las historias médicas». Lo que el
  médico sí pidió en su consulta queda colgado de esa consulta, y el resultado
  vuelve ahí: es `atencion.origen_id`.

## Decisiones que ya están tomadas

**Los campos clínicos van en `jsonb`, no en columnas.** Son sesenta y pico,
casi todos opcionales, y el formulario va a cambiar. El modelo manda desde
`historia.ts` y `laboratorio.ts`; la base guarda lo que se escribió. Los
resultados son la excepción: van en su propia columna, porque son una lista
de mediciones y `datos` es plano.

**El tipo de atención no cambia.** Se decide cuando la atención nace. Una
consulta no se vuelve una orden de laboratorio ni al revés.

**Nada se borra.** Una atención se anula con motivo y autor; no se elimina.
Toda lectura y escritura queda en `bitacora`. En datos de salud esto no es
opcional.

**No queda ningún archivo en la VPS.** El documento es HTML con hoja de
impresión —el PDF lo saca el navegador—, el QR se dibuja en el momento, el
Excel se arma en memoria y el correo lleva el informe en el cuerpo. Ni PDF, ni
imágenes, ni adjuntos guardados.

**El precio se copia al renglón.** Si mañana cambia la lista de servicios, lo
ya facturado no se mueve.

**El correlativo lo pone la base**, no la pantalla: el 555, 556, 557 que pidió
el cliente sale de una secuencia, no de contar filas.

**Los valores de referencia no se inventan.** Dependen del método y del equipo
de cada laboratorio; imprimir los de un libro al lado de un resultado sería
firmar en nombre del centro algo que no medimos. Se escriben a mano hasta que
llegue el Excel del cliente.

**El correo nace apagado.** Las credenciales de Mailgun no alcanzan: hace falta
además `CORREO_ACTIVO=1`. Sin eso la pantalla arma el mensaje completo y dice
que no mandó nada. El botón es manual y confirma la dirección del paciente,
que se puede corregir ahí mismo.

## Lo que falta de parte del cliente

1. **El Excel del laboratorio**: sus exámenes, sus valores de referencia y sus
   fórmulas. Quedó en mandarlo. Es lo único que falta para cerrar el
   laboratorio.
2. **El video** de cómo trabaja hoy con el programa que está evaluando.
3. **El Gmail del centro**, para crear la cuenta de Mailgun con el dominio
   propio. El dominio de pruebas solo entrega a direcciones autorizadas: con
   eso no se le puede escribir a un paciente.
4. Las plantillas Excel reales de cada aseguradora.
5. Lista de servicios con precio, laboratorio incluido.
6. Cuántos usuarios y quiénes, con su colegiatura.

## Cómo correr las pruebas

```bash
set -a; . ./.env; set +a
export BASE_DATOS="postgres://…/atenmefa_pruebas"   # OJO: la de pruebas
pnpm base-de-pruebas     # la rehace desde cero y crea las cinco cuentas
pnpm build && pnpm pruebas
```

La base se rehace **cada vez**. Varias pruebas cuentan filas; cualquier cosa
que haya quedado de una corrida anterior hace fallar una prueba en otro
archivo, y la falla sale donde no está el problema.
