# Atenmefa — sistema visual

## Mundo

El vocabulario viene del logo del cliente, no de la categoría: insignia circular,
línea de electrocardiograma y la **banda a cuadros de ambulancia**. Es un servicio
de emergencia, y la página se ve como tal: institucional, de alto contraste, legible
de un vistazo y con la acción urgente siempre a la vista.

Formal no significa apagado. El azul manda la superficie; el rojo aparece poco y
solo donde hay que actuar.

## Color

| Token | Valor | Uso |
|---|---|---|
| `--azul-profundo` | `#0b0f45` | Tira superior y pie |
| `--azul` | `#111663` | Superficie principal oscura, titulares |
| `--azul-medio` | `#272f9c` | Estados sobre azul |
| `--azul-tenue` | `#e9ebf7` | Realces sobre claro |
| `--rojo` | `#d31c24` | **Solo emergencia y acción primaria.** Nunca decorativo |
| `--rojo-hondo` | `#9d1119` | Estado activo del rojo |
| `--papel` | `#ffffff` | Fondo base |
| `--bruma` | `#f4f6fb` | Fondo alterno, sesgo azul |
| `--tinta` | `#131726` | Texto |
| `--tinta-suave` | `#474d63` | Texto secundario |
| `--tinta-tenue` | `#646a7e` | Mínimo 4.5:1 sobre ambos fondos |
| `--linea` | `#d8deeb` | Hairlines |

El rojo es el recurso más escaso de la página. Si aparece en más de un sitio por
pantalla, algo está mal.

## Tipografía

- **Figtree** (variable, subconjunto latino) para titulares y controles.
- **Noto Sans** (400/600, latino) para texto corrido: rinde en pantallas Android
  baratas, que es el visitante real.
- Escala: 0.78 · 0.88 · 1 · 1.15 · 1.45 · 1.95 · 2.6 · 3.4rem.
- Tracking de titulares −0.025em. Texto corrido entre 65 y 72ch.
- Cifras con `tabular-nums` donde se comparan.

## Superficies y profundidad

**Una sola declaración de elevación por elemento.** Las superficies de información
son planas con hairline de 1px. La sombra queda reservada a lo que de verdad flota:
el botón de emergencia, la barra fija y el panel del menú.

Radio 14px en bloques, pastilla solo en controles pequeños.

Prohibido en este proyecto: barras de color al borde de bloques, rejillas de
tarjetas iguales como estructura de sección, rótulos sobre los titulares.

## Movimiento

**Un momento propio:** la cinta de horarios y avisos de la tira superior, que
avanza despacio y se detiene al pasar el puntero, al enfocar con teclado y con
movimiento reducido. El resto son microtransiciones de 160–220ms.

Nada que pueda dejar contenido invisible. Sin animaciones de entrada por scroll.

## Iconos

Juego propio, rejilla de 24px, trazo 1.75px, `currentColor`, extremos redondeados.
Nunca glifos Unicode ni emoji haciendo de icono.

## Superficies del navegador

Selección, barra de desplazamiento, anillo de foco y subrayados se tiñen desde la
paleta. Son parte del diseño.
