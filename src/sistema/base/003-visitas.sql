-- Medición del sitio público: cuánta gente entra y qué hace.
--
-- POR QUÉ ESTAS TABLAS NO PUEDEN IDENTIFICAR A NADIE
--
-- El sitio es la cara de un centro de salud. Quien entra a leer sobre
-- emergencias o sobre laboratorio está contando algo de su salud sin
-- saberlo, así que acá se mide el tráfico sin guardar nada que permita
-- volver a la persona. Las decisiones, y lo que cada una descarta:
--
--   · No se guarda la dirección IP. Ni en una columna, ni en un registro
--     del servidor. Una IP sola ya es un dato personal y basta para
--     ubicar a alguien; una IP junto a "abrió la página de emergencias"
--     es un dato de salud.
--
--   · No hay cookies ni nada guardado en el navegador. No hace falta
--     pedir consentimiento porque no se deja nada en el equipo de nadie.
--
--   · Para contar visitantes distintos se guarda "huella": un HMAC de
--     (IP + user-agent) con una sal que CAMBIA TODOS LOS DÍAS. La sal
--     sale de AUTH_SECRETO más la fecha.
--     Lo que esto SÍ da:
--       - mañana el mismo visitante da otra huella, así que nadie puede
--         seguir a una persona de un día al otro;
--       - con la base de datos en la mano y NADA MÁS, estas huellas no
--         sirven para nada: no se puede volver a la IP ni probar huellas
--         contra una lista de direcciones.
--     Lo que esto NO da, y conviene no creérselo: con la base Y el .env
--     juntos, la sal de cualquier día pasado se vuelve a calcular, porque
--     AUTH_SECRETO es permanente y la fecha es pública. Desde ahí, dar
--     con la IP de una huella es fuerza bruta sobre IPv4 —minutos— o
--     instantáneo contra una lista de direcciones sospechadas. Si algún
--     día hace falta que ni el dueño del servidor pueda deshacerlo, la
--     sal tiene que ser aleatoria, guardarse en una tabla propia y
--     borrarse a los pocos días; mientras tanto, el .env es lo que hay
--     que cuidar.
--     Consecuencia aceptada: "visitantes únicos" en un rango de varios
--     días es la SUMA de los únicos de cada día, no personas distintas.
--     Eso se dice en la pantalla; inflar el número sería mentir.
--
--   · Del referente se guarda solo el dominio ("instagram.com"), nunca la
--     dirección completa: la URL entera de donde viene alguien suele
--     llevar su búsqueda o su identificador de usuario.
--
--   · El país solo se guarda si el proxy lo manda en una cabecera. No se
--     deduce de la IP: no hay con qué, y un país inventado es peor que un
--     país vacío.
--
--   · Nada de esto sale hacia una herramienta de terceros. No hay
--     Analytics, no hay píxel, no hay nada que avise a nadie más.
--
-- Por lo mismo, estas dos tablas son las únicas del sistema que SÍ se
-- pueden borrar o recortar sin perder nada clínico: son conteos.

CREATE TYPE dispositivo_visita AS ENUM ('movil', 'escritorio', 'tablet');

-- Lista cerrada a propósito. El navegador manda uno de estos nombres y
-- nada más; agregar una acción nueva es una migración, no un texto libre
-- que llega de afuera y se guarda tal cual.
CREATE TYPE tipo_evento AS ENUM (
  'llamar',        -- tocó un enlace tel:
  'whatsapp',      -- tocó un enlace de WhatsApp
  'como_llegar',   -- tocó el mapa / "cómo llegar"
  'ver_servicio',  -- abrió la página de un servicio
  'instagram',
  'correo'
);

-- Una fila por página vista. Sin identificador de persona: la huella es
-- del día (ver arriba).
CREATE TABLE visita (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  momento     timestamptz NOT NULL DEFAULT now(),
  -- Ruta normalizada, sin la cadena de consulta: /servicios/emergencias.
  -- Sin normalizar, la misma página se parte en varias filas y el informe
  -- de "más vistas" queda inservible.
  ruta        text NOT NULL,
  -- Solo el dominio. NULL = entró directo o el navegador no lo mandó.
  referente   text,
  dispositivo dispositivo_visita NOT NULL,
  -- NULL cuando el user-agent no deja reconocerlo. No se adivina.
  navegador   text,
  pais        text CHECK (pais IS NULL OR pais ~ '^[A-Z]{2}$'),
  huella      text NOT NULL
);
-- Los dos cortes que hace la pantalla: por fecha y por página.
CREATE INDEX visita_momento_idx ON visita (momento DESC);
CREATE INDEX visita_ruta_idx    ON visita (ruta, momento DESC);

-- Qué HACE la gente, que es la pregunta que de verdad importa: un
-- visitante que llamó vale más que diez que pasaron.
CREATE TABLE evento (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  momento  timestamptz NOT NULL DEFAULT now(),
  tipo     tipo_evento NOT NULL,
  -- Dato corto que acompaña al tipo y SIEMPRE lo pone el servidor a
  -- partir de la ruta (por ejemplo el servicio que se abrió). Lo que
  -- manda el navegador no entra acá.
  detalle  text,
  ruta     text NOT NULL,
  huella   text NOT NULL
);
CREATE INDEX evento_momento_idx ON evento (momento DESC);
CREATE INDEX evento_tipo_idx    ON evento (tipo, momento DESC);
-- Para cruzar quién visitó con quién hizo algo (la conversión).
CREATE INDEX evento_huella_idx  ON evento (huella);
