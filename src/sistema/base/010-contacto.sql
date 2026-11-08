-- Correo y WhatsApp del paciente.
--
-- El cliente los enumeró al describir el registro del laboratorio: «nombre,
-- apellido, cédula, número telefónico, whatsapp, correo». Y son lo que hace
-- falta para lo otro que pidió: que el informe se le pueda mandar.
--
-- POR QUÉ EN paciente Y NO EN LA ATENCIÓN
--
-- El correo de una persona no cambia entre una visita y la siguiente. Vivía
-- suelto en datos->>'telefono' de cada atención y eso ya tiene un costo
-- visible: para mandarle algo había que ir a buscar su última atención. Acá
-- se escribe una vez y recepción lo corrige cuando el paciente lo dice.
--
-- POR QUÉ whatsapp APARTE DE telefono
--
-- Porque no siempre es el mismo número: el que deja para que lo llamen es a
-- veces el de la casa. Si está vacío, el botón de WhatsApp usa el teléfono;
-- no se pregunta dos veces lo mismo al que solo tiene celular.

ALTER TABLE paciente
  ADD COLUMN correo   text,
  ADD COLUMN whatsapp text;

COMMENT ON COLUMN paciente.whatsapp IS
  'Solo si es distinto del teléfono. Vacío significa "use el teléfono".';
