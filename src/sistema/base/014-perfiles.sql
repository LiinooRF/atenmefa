-- Perfiles: combos de exámenes.
--
-- El cliente lo explicó con una hamburguesa: «es como un combo de
-- hamburguesa con papas fritas más Coca-Cola, pero se deben poder
-- deseleccionar algún examen si lo quiero quitar, porque un perfil puede
-- tener 5 exámenes y yo solo quiero 3».
--
-- POR QUÉ ESTO CAMBIA LO QUE HAY EN EL CATÁLOGO
--
-- Hasta acá el catálogo tenía las 35 HOJAS de su archivo como si cada una
-- fuera un examen: «PERFIL LIPIDICO» era un renglón con un precio. Con eso
-- no se puede cobrar «3 de los 5»: el precio es uno y entero.
--
-- La estructura que hace falta ya estaba en su propio Excel: cada hoja es
-- un perfil y sus renglones son los exámenes. El perfil lipídico tiene
-- cinco —colesterol total, HDL, LDL, VLDL y triglicéridos— y querer solo
-- tres de esos cinco es exactamente lo que él describió. Así que el
-- catálogo pasa a tener las 150 determinaciones de sus hojas, y los
-- perfiles las agrupan.
--
-- EL PRECIO ES LA SUMA DE LO QUE QUEDE MARCADO
--
-- Un perfil no tiene precio propio. Si lo tuviera, quitarle un examen
-- dejaría el combo cobrado igual, que es justo lo que él no quiere. El
-- perfil es un atajo para marcar; lo que se cobra son los exámenes que
-- queden marcados. Si algún día quiere un precio de combo con descuento,
-- es otra cosa y hay que decirlo.
--
-- Los perfiles y sus miembros los carga administración con un botón, desde
-- Servicios y precios, y después puede crear los suyos: él nombró cinco
-- —lipídico, básico, hepático, control prenatal y tiroideo— y tres de esos
-- no existen como hoja en su archivo. Esos los arma él; no se inventan.

CREATE TABLE perfil (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       text NOT NULL,
  -- Sin tildes ni mayúsculas: para no crear dos veces el mismo perfil.
  nombre_busca text NOT NULL UNIQUE,
  activo       boolean NOT NULL DEFAULT true,
  -- En qué orden salen los botones en la pantalla de la orden.
  orden        integer,
  creado       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE perfil_examen (
  perfil_id   uuid NOT NULL REFERENCES perfil(id) ON DELETE CASCADE,
  servicio_id uuid NOT NULL REFERENCES servicio(id),
  orden       integer NOT NULL DEFAULT 1,
  PRIMARY KEY (perfil_id, servicio_id)
);

COMMENT ON TABLE perfil IS
  'Combos de exámenes. No tienen precio propio: se cobra la suma de los que queden marcados.';
COMMENT ON TABLE perfil_examen IS
  'Qué exámenes trae cada perfil. Se marcan todos al elegirlo y se puede destildar cualquiera.';

CREATE INDEX perfil_examen_servicio_idx ON perfil_examen (servicio_id);
