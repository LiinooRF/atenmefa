# Atenmefa

## Qué es

Centro de atención médica familiar en Ciudad Bolívar, Venezuela, en el C.C. Santa
Catalina de La Sabanita. Consulta, laboratorio clínico, emergencias y procedimientos
menores en el local, más traslados en ambulancia con cobertura nacional.

Trabaja además como proveedor afiliado de redes de asistencia médica, atendiendo
casos que factura a aseguradoras.

## A quién le habla esta superficie

La landing pública, no el sistema interno.

**Quien tiene una urgencia ahora.** Alguien busca una ambulancia desde el teléfono,
con prisa y probablemente nervioso. No lee: busca un número y lo marca. Es el
visitante que define la página.

**Quien compara antes de elegir.** Necesita un examen de laboratorio, un
electrocardiograma o una consulta y quiere saber dónde queda, a qué hora abre,
cuánto cuesta y si le toman el seguro. Llega por búsqueda.

**Quien pregunta a una IA.** Cada vez más gente le pregunta a Gemini "dónde me hago
un electrocardiograma en Ciudad Bolívar". La página tiene que ser citable: datos
verificables, preguntas respondidas de forma recortable, personal identificable.

## Contexto de uso que manda sobre todo lo demás

- **Teléfono, siempre.** La mayoría entra desde un Android de gama baja.
- **Datos caros y conexión lenta.** El sitio anterior pesaba 16 MiB y tardaba
  90 segundos en móvil 3G. El peso no es una métrica técnica acá: es si la página
  llega o no llega.
- **Luz e internet intermitentes.** Nada puede depender de que todo cargue bien.
- **Pagos a la venezolana:** pago móvil, transferencia en bolívares, punto de venta
  y divisas en efectivo.

## Qué tiene que lograr

1. Que quien necesita una ambulancia llegue al teléfono en un toque, desde
   cualquier punto de la página.
2. Que quien compara encuentre servicio, dirección, horario y forma de pago sin
   tener que escribir.
3. Que Google y los buscadores con IA puedan citar la clínica con confianza.

## Qué NO es

- No es un portal de pacientes. No hay citas en línea ni resultados en línea.
- No es el sistema de historias clínicas: ese es un producto aparte, privado,
  detrás de login y fuera de los buscadores.
- No vende: deriva a una llamada o a WhatsApp.

## Verdad del producto que no se puede inventar

El sitio solo publica lo confirmado por el cliente. Horarios, precios, personal y
credenciales viven en `src/data/clinica.ts`; lo que está en `null` no se muestra.
En salud un dato inventado no es un detalle: genera reseñas de una estrella y
penalización en búsqueda.

Pendiente de confirmar, y bloquea secciones enteras: horario día por día, si la
ambulancia es 24/7, teléfono fijo, quiénes atienden con su colegiatura, precios,
coordenadas, ficha de Google Business y el dominio definitivo.

## Marca

Azul marino `#111663` y rojo `#D31C24`, tomados del logo: una insignia circular con
la línea de electrocardiograma y la banda a cuadros de ambulancia. El vocabulario
visual del servicio de emergencia es del cliente, no una decoración añadida.
