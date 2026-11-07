-- La tasa del día, para poder leer los totales en bolívares.
--
-- POR QUÉ HACE FALTA
--
-- El centro cotiza en dólares y cobra en bolívares por taquilla, así que el
-- cierre del mes termina con dos totales que no se pueden sumar: "1.200,00
-- USD y 340.000,00 VES". Nadie sabe cuánto es eso junto. Con una tasa sí se
-- puede, y entonces el número significa algo.
--
-- SOLO LA OFICIAL
--
-- Se guarda la del BCV y nada más. Es la que vale para facturarle a una
-- aseguradora, y es la única que alguien puede verificar contra una fuente
-- pública si discute una factura. El paralelo quedaría más cerca de lo que
-- se cobra en la calle, pero un informe que se le manda a una aseguradora
-- con una tasa que el BCV no reconoce no se sostiene.
--
-- UNA FILA POR DÍA PUBLICADO, Y NUNCA SE PISA
--
-- El BCV publica en días hábiles. La tasa que le toca a una fecha es la
-- última publicada en esa fecha o antes, que es como funciona de verdad: lo
-- del sábado se liquida con la del viernes.
--
-- Esto es lo que hace que el número no mienta. Una atención del 20 de
-- octubre se convierte con la tasa del 20 de octubre, no con la de hoy. En
-- Venezuela la diferencia entre una y otra no es un detalle de redondeo.
-- Por eso la fecha es la llave y las filas no se actualizan: lo que ya se
-- guardó para un día es lo que había ese día.

CREATE TABLE tasa (
  -- El día que el BCV publicó este valor, en hora de Caracas.
  fecha      date PRIMARY KEY,
  -- Cuántos bolívares vale un dólar. Con decimales: el BCV publica ocho.
  bolivares  numeric(18, 6) NOT NULL CHECK (bolivares > 0),
  -- Cuándo lo trajimos nosotros, que no es lo mismo que cuándo se publicó.
  tomada     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE tasa IS
  'Tasa oficial del BCV, una fila por día publicado. La fecha es la llave y las filas no se actualizan: convertir una atención vieja con la tasa de hoy daría un número inventado.';
