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

- **El médico no pone ni pide laboratorio.** Lo preguntó el cliente —«¿por
  qué el médico puede pedir o poner laboratorio? Por eso hay un
  bioanalista»— y es la línea que separa los oficios: él indica los
  exámenes escribiéndolos en su historia, recepción registra la orden y el
  bioanalista carga los resultados. El médico LEE lo que volvió.
- Por eso tampoco hay un paso que pregunte «¿atención general o
  laboratorio?»: lo decide el rol, y preguntar algo con una sola respuesta
  posible era un toque de más entre la cédula y el formulario.
- La orden se registra en dos pasos y no nueve: no hay examen físico ni
  diagnóstico que escribir.
- **Perfiles: combos de exámenes.** El cliente lo explicó con una
  hamburguesa: «un combo con papas y Coca-Cola, pero se deben poder
  deseleccionar algún examen, porque un perfil puede tener 5 y yo solo
  quiero 3». Un perfil **no tiene precio propio**: si lo tuviera, quitarle
  un examen lo cobraría igual. Es un atajo para marcar; lo que se cobra es
  la suma de lo que quede marcado.
  
  La estructura salió de su propio Excel: cada hoja es un perfil y sus
  renglones son los exámenes. Por eso el catálogo tiene las **141
  determinaciones** y no las 35 hojas: sin precio por determinación no se
  puede cobrar «3 de los 5». Administración arma los suyos en
  `/sistema/perfiles` —él nombró cinco y tres no existen como hoja— y puede
  renombrar los que vinieron con el nombre de la pestaña del Excel
  («COAG.», «TRANS-BIL-PROT»).
- **El catálogo de exámenes se llena de un botón.** El selector de la orden
  sale del catálogo de precios, y ese arrancaba vacío: la pantalla decía
  «todavía no hay exámenes» y la única salida era teclear 35 nombres. Ahora
  administración los carga de una vez desde Servicios y precios. Entran
  **sin precio** —no tenemos los suyos y uno inventado termina cobrado— y la
  pantalla los muestra como «sin precio», no como «0,00»: se pueden marcar
  en una orden, queda registrado qué se le hizo, y no suman al total. Con
  141 exámenes la lista se filtra, y **lo marcado no se esconde al
  filtrar**: perder de vista algo ya elegido es como se cobra de menos.
- **Ocho analitos se calculan solos**, con las fórmulas de su propio
  archivo: VLDL (triglicéridos ÷ 5), LDL (total − HDL − VLDL), bilirrubina
  indirecta, globulinas, relación A/G, CHCM, volumen de orina por minuto y
  depuración de creatinina. Se resuelven en cadena —el LDL necesita el VLDL,
  que también se calcula— y el campo queda **editable**: si quien mide
  escribe encima, el suyo manda y deja de recalcularse. Ver
  `src/sistema/calculos.ts`, que explica también las cuatro fórmulas de la
  hoja HEMA que NO se programaron porque no calculan nada.
- **Las plantillas de examen salen del archivo del cliente**
  (`LABORATORIO CA.xls`): 35 exámenes y 188 analitos con su unidad. El
  bioanalista elige el examen y le aparecen los renglones. 92 de los 188
  vienen SIN valor de referencia a propósito: solo se cargó el rango cuando
  la cabecera de su propia hoja señalaba la columna. Deducirlo ponía el
  rango de un examen al lado del resultado de otro —la ferritina salía con
  el de la testosterona femenina—. Ver `base/013-plantillas.sql`, que
  explica también tres defectos del propio archivo que él debería arreglar.
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

## El diagnóstico

El campo del diagnóstico es un buscador del catálogo **CIE-10 de la OMS**
—12.551 rúbricas vigentes— que además deja escribir a mano. Las dos mitades
las pidió el cliente y la segunda importa tanto como la primera: un médico
frente a un paciente no puede quedarse trabado porque el catálogo no tiene
la palabra que él usa.

- El catálogo sale del **CEMECE / DGIS de México** (abril 2024), que es el
  centro colaborador de la OMS para la CIE en español. No es la CIE-10-ES
  española ni la ICD-10-CM estadounidense: esas tienen códigos que no
  coinciden con los que pide una aseguradora venezolana. Ningún código está
  escrito a mano; `base/011-diagnosticos.sql` se generó leyendo ese archivo.
- Elegir del catálogo guarda el nombre **y** el código. **El código y el
  texto no se separan nunca**: si el texto se edita a mano, el código se va.
  Un código que dice una cosa al lado de un nombre que dice otra termina
  impreso en la planilla de un seguro, y es la única manera en que esta
  pieza puede hacer daño.
- El código sale impreso en el informe, que es para lo que sirve codificar.
- Administración deja arriba los más comunes en `/sistema/diagnosticos`.
  **No hace falta marcar nada para que sirva**: lo que no esté marcado se
  ordena por lo que este centro ya usó. Ahí abajo está también lo que se
  escribió a mano sin código, que es la lista de candidatos a codificar.
- La restricción de sexo que trae el catálogo se usa para **avisar**, no
  para bloquear: no viene en todas las rúbricas, y bloquear con un dato
  incompleto dejaría afuera diagnósticos legítimos.

## El paciente: las cuatro operaciones

Administración y recepción lo crean, lo corrigen y lo borran. Tres límites,
y los tres para que el registro pueda mirarse a los ojos dentro de cinco
años:

- **se crea** sin abrirle una atención, en `/sistema/pacientes/nuevo`. Para
  anotar a quien llamó por teléfono sin inventarle una consulta;
- **se corrige** nombre, documento, sexo y contacto, y todo queda en
  bitácora con lo que decía antes. Lo que NO se hace es **fusionar**: si el
  documento nuevo ya es de otra persona, el guardado se rechaza y se dice de
  quién es. Juntar dos fichas se hace a mano y con cuidado;
- **se borra** solo a quien no tiene ni una atención, y escribiendo su
  documento para confirmar. Es lo único que se borra de verdad en todo el
  sistema, y se puede porque una ficha sin atenciones no tiene un solo dato
  clínico adentro: es un error de tipeo con nombre.

## Borrar un borrador

Es lo único que se borra de una atención, y se puede porque un borrador no
está firmado: no entró en el cierre del mes, no se imprimió con PIN y no se
le entregó a nadie. Lo cerrado se anula con motivo, como siempre.

- lo borra **quien lo abrió** —el médico el suyo, recepción o el bioanalista
  la orden— y **administración cualquiera**;
- el que nadie toca en **20 días se borra solo**, y «sin tocar» es la última
  línea de bitácora, no la fecha de creación;
- el automático NO toca lo que tenga renglones de cobro o resultados
  cargados. Un cobro que desaparece solo es un agujero en la caja. Eso se
  queda hasta que una persona decida;
- la limpieza corre cuando alguien abre `/sistema/borradores`. No hay cron:
  si nadie entra en veinte días, tampoco le molesta un borrador viejo.

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
7. ¿Recepción ve el cierre del mes? Hoy cobra pero no ve el consolidado.
8. ¿Los diagnósticos frecuentes los marca solo administración? Hoy sí,
   porque fue lo que pidió; el médico es quien de verdad sabe cuáles son, y
   dárselo es una línea en la tabla de permisos.

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
