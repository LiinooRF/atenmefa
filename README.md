# Atenmefa

Sitio de Atenmefa — Atención Médica Familiar, Ciudad Bolívar, Venezuela.

Astro estático. Sin JavaScript en el cliente: el menú móvil y las preguntas
frecuentes funcionan con HTML (`<details>`), no con scripts. Eso es a propósito,
porque el visitante entra desde un celular con datos caros y conexión lenta.

## Arrancar

```bash
pnpm install
pnpm dev          # desarrollo en localhost:4321
pnpm build        # genera dist/
pnpm preview      # sirve dist/ para revisar
pnpm captura      # capturas en móvil y escritorio (necesita pnpm preview corriendo)
```

Requiere Node 22.12 o superior.

## Dónde se cambian las cosas

**Todo el contenido vive en un solo archivo: `src/data/clinica.ts`.**

Dirección, teléfonos, servicios, preguntas frecuentes, equipo médico y formas de
pago salen de ahí. Cambiar un dato una vez lo actualiza en la página, en los
datos estructurados de Google y en el pie, sin tocar ningún componente.

Los campos en `null` son datos que el cliente todavía no entregó. Mientras sigan
en `null` **no se publican**: en su lugar aparece un recuadro que dice qué falta.
Es deliberado — un horario inventado en un centro de salud genera reseñas de una
estrella y Google lo penaliza. Al llenar el dato, el recuadro desaparece solo.

## Lo que falta pedirle al cliente

Las imágenes están como recuadros con la medida exacta que hay que entregar.
Se reemplazan por `<Image>` de Astro y la página no se mueve, porque el espacio
ya está reservado.

| Qué | Dónde | Medida |
|---|---|---|
| Foto de fachada o del equipo con la ambulancia | portada | 1000 × 1100 px, vertical |
| Retrato del Dr. Jesús R. Tábata G. | equipo | 600 × 600 px |
| Retrato de Pedro Tábata | equipo | 600 × 600 px |
| Mapa con el local señalado o fachada desde la calle | ubicación | 900 × 760 px |
| Imagen para compartir por WhatsApp | `public/og.jpg` | 1200 × 630 px |

Mientras no llegue la última, `og:image` apunta a `og-provisional.png`, que es
el logo del cliente reescalado.

Datos todavía pendientes, en orden de urgencia:

1. **Horario de atención, día por día**, y si la ambulancia es de verdad 24/7.
2. **Teléfono fijo del local.** Hoy el único canal es un celular, y quien
   necesita una ambulancia llama.
3. **Número M.S.D.S. del Dr. Tábata.** En el sello se lee `45732` pero está
   borroso; hasta confirmarlo no se publica en los datos estructurados.
   El `4.279` que aparece en su papelería bajo "N° M.S.D.S." es en realidad el
   número del Colegio de Médicos.
4. **Coordenadas exactas** de la entrada del local.
5. **Enlace a la ficha de Google Business**, y quién tiene el acceso.
6. **Respuestas a seis preguntas frecuentes** que ya están escritas en
   `src/data/clinica.ts` esperando el dato.
7. **Precios o rangos** por servicio.
8. **Correo propio del dominio**, para dejar el Gmail.
9. **Dominio definitivo.** Hoy es `.site` y hay que decidirlo antes de publicar:
   de eso dependen el canonical, la ficha de Google y todo enlace que se reparta.
   Se cambia en `clinica.dominio` y en `astro.config.mjs`.

## Posicionamiento

- `robots.txt` **deja entrar** a `Google-Extended`, que es el rastreador que
  decide si Gemini puede usar el contenido para fundamentar respuestas.
  Bloquearlo saca a la clínica de las respuestas donde queremos aparecer.
- Los datos estructurados son un grafo unido por `@id`: `MedicalClinic`,
  un `Physician` por cada profesional, `WebSite`, `WebPage` y `FAQPage`.
  No son bloques sueltos: describen un solo negocio.
- Las preguntas frecuentes son la palanca principal. Cada respuesta arranca
  contestando y se sostiene sola al recortarla, que es como una respuesta de IA
  la puede citar. Al escribir una nueva, no empezar con "En Atenmefa entendemos
  que…".
- En salud, Google y los buscadores con IA no citan a "profesionales
  capacitados": citan a alguien con nombre y credencial. Por eso la sección del
  equipo publica el número de colegiatura.

## Peso

La portada pesa **86 KB** con la fuente incluida. El sitio anterior pesaba
16,15 MiB y tardaba 90 segundos en cargar en un móvil 3G; este tarda medio
segundo. Cuando lleguen las fotos reales hay que mantenerlo por debajo de
400 KB: usar siempre `<Image>` de Astro, que genera WebP del tamaño necesario.

No volver a poner videos con `autoplay`. Los dos del sitio anterior sumaban
casi 11 MiB y se descargaban antes de que el visitante decidiera nada.
