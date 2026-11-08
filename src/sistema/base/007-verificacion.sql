-- Verificación de un documento emitido.
--
-- PARA QUÉ
--
-- Una aseguradora, un laboratorio o la empresa de alguien recibe un informe
-- o un récipe en papel y necesita saber si de verdad lo emitió Atenmefa.
-- Hoy no hay forma: el papel se puede rehacer en cualquier procesador de
-- texto. El documento lleva ahora un QR y un PIN, y quien lo recibe los
-- contrasta contra el sitio.
--
-- QUÉ SE COMPRUEBA Y QUÉ NO SE MUESTRA
--
-- La página de verificación es PÚBLICA: no hay sesión. Por eso confirma que
-- el documento existe, de qué fecha es, quién lo firmó y si sigue vigente, y
-- NO muestra una línea de la historia clínica. El diagnóstico y el
-- tratamiento son del paciente y de su médico; quien verifica solo necesita
-- saber que el papel es auténtico.
--
-- POR QUÉ EL PIN VA EN CLARO
--
-- No es una contraseña: es un código impreso en el propio papel, igual que
-- el número de un acta. Tiene que poder mostrarse para imprimirlo. Guardarlo
-- cifrado no protegería de nada: quien llegue a esta tabla ya tiene al lado
-- la historia clínica entera, que es incomparablemente más sensible.
--
-- POR QUÉ SE PIDE TAMBIÉN LA CÉDULA
--
-- Para que la dirección del QR no alcance sola. Si alguien reenvía el enlace
-- —o fotografía el QR de lejos— sin tener el papel, no puede verificar nada.
-- Hacen falta las dos cosas, y las dos están impresas en el documento.

ALTER TABLE atencion
  -- Seis dígitos, como cadena: "004821" no es 4821.
  ADD COLUMN pin text CHECK (pin IS NULL OR pin ~ '^[0-9]{6}$'),
  -- Contra la fuerza bruta. Un PIN de seis dígitos son un millón de
  -- combinaciones: sin freno, un script las prueba todas en una tarde.
  ADD COLUMN intentos_fallidos integer NOT NULL DEFAULT 0,
  ADD COLUMN bloqueada_hasta timestamptz;

COMMENT ON COLUMN atencion.pin IS
  'Código de seis dígitos impreso en el documento. Se asigna al cerrar la atención y no cambia: un documento ya entregado tiene que seguir verificándose.';

COMMENT ON COLUMN atencion.bloqueada_hasta IS
  'Hasta cuándo no se aceptan más intentos de verificación de ESTE documento. Se pone al acumular fallos y se limpia con un acierto.';
