/**
 * Verificar que un documento impreso lo emitió Atenmefa.
 *
 * El papel se puede rehacer en cualquier procesador de texto. Una
 * aseguradora que recibe un informe, una empresa que recibe un reposo o una
 * farmacia que recibe un récipe no tienen hoy forma de saber si es real.
 *
 * El documento lleva un QR y un PIN de seis dígitos. Quien lo recibe abre la
 * dirección del QR, escribe la cédula del paciente y el PIN, y el sitio le
 * confirma si ese documento existe.
 *
 * TRES DECISIONES QUE SOSTIENEN ESTO
 *
 *   1. La página es PÚBLICA y por eso no muestra NADA de la historia
 *      clínica. Confirma que el documento existe, de qué fecha es, quién lo
 *      firmó y si sigue vigente. El diagnóstico y el tratamiento son del
 *      paciente y su médico; quien verifica solo necesita saber si el papel
 *      es auténtico.
 *
 *   2. Hacen falta las DOS cosas, cédula y PIN, y las dos están impresas en
 *      el papel. Así la dirección del QR no alcanza sola: reenviar el enlace
 *      —o fotografiar el QR de lejos— no sirve para verificar nada.
 *
 *   3. Se cuentan los fallos. Un PIN de seis dígitos son un millón de
 *      combinaciones y la cédula suele conocerse: sin freno, un script las
 *      prueba todas. A los cinco fallos el documento queda cerrado un rato.
 *
 * No se guarda ningún archivo: ni PDF, ni imagen del QR. El QR se dibuja en
 * el momento como SVG dentro de la página.
 */
import { randomInt } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { bd, esquema } from './base';
import { llaveDe, soloDigitos, type TipoDocumento } from './documento';

/** Cuántos fallos seguidos se toleran antes de cerrar el documento. */
const FALLOS_PERMITIDOS = 5;
/** Y por cuánto rato queda cerrado. */
const MINUTOS_DE_ESPERA = 15;

/**
 * Seis dígitos al azar, del generador criptográfico y no de Math.random:
 * un PIN predecible es lo mismo que no tener PIN.
 *
 * Se guardan los ceros de adelante: "004821" es un PIN válido y distinto de
 * "4821". Por eso es texto y no número.
 */
export const pinNuevo = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

export type Resultado =
  | { estado: 'ok'; documento: Documento }
  | { estado: 'no-calza' }
  | { estado: 'bloqueado'; minutos: number }
  | { estado: 'sin-pin' };

export interface Documento {
  numero: number;
  fecha: string;
  paciente: string;
  documentoPaciente: string;
  tipoDoc: TipoDocumento;
  medico: string | null;
  colegiatura: string | null;
  /** Para rotular la colegiatura como lo que es. */
  firmaDe: 'medico' | 'bioanalista';
  anulada: boolean;
  /** Lo que haya: informe siempre, récipe solo si lo lleva. */
  hojas: string[];
}

const minutosQueFaltan = (hasta: Date) =>
  Math.max(1, Math.ceil((hasta.getTime() - Date.now()) / 60_000));

/**
 * Comprueba un documento. Nunca dice por qué falló con detalle: "no calza"
 * cubre tanto el PIN equivocado como la cédula equivocada, porque distinguir
 * los dos le diría a quien prueba al azar cuál de los dos ya acertó.
 */
export async function verificar(
  id: string,
  documentoEscrito: string,
  pinEscrito: string,
): Promise<Resultado> {
  const [caso] = await bd
    .select({
      id: esquema.atencion.id,
      numero: esquema.atencion.numero,
      fecha: esquema.atencion.fecha,
      estado: esquema.atencion.estado,
      tipo: esquema.atencion.tipo,
      datos: esquema.atencion.datos,
      resultadosPor: esquema.atencion.resultadosPor,
      pin: esquema.atencion.pin,
      intentos: esquema.atencion.intentosFallidos,
      bloqueadaHasta: esquema.atencion.bloqueadaHasta,
      paciente: esquema.paciente.nombre,
      cedula: esquema.paciente.cedula,
      cedulaBusca: esquema.paciente.cedulaBusca,
      tipoDoc: esquema.paciente.tipoDoc,
      medico: esquema.user.name,
      colegiatura: esquema.user.colegiatura,
    })
    .from(esquema.atencion)
    .innerJoin(esquema.paciente, eq(esquema.paciente.id, esquema.atencion.pacienteId))
    .innerJoin(esquema.user, eq(esquema.user.id, esquema.atencion.medicoId))
    .where(eq(esquema.atencion.id, id))
    .limit(1);

  /* Un id que no existe se responde igual que un PIN equivocado: si dijera
     "ese documento no existe", probar ids sueltos diría cuáles sí. */
  if (!caso) return { estado: 'no-calza' };

  // Un borrador todavía no es un documento: no tiene PIN y no se verifica.
  if (!caso.pin) return { estado: 'sin-pin' };

  if (caso.bloqueadaHasta && caso.bloqueadaHasta.getTime() > Date.now()) {
    return { estado: 'bloqueado', minutos: minutosQueFaltan(caso.bloqueadaHasta) };
  }

  /* La cédula se compara normalizada, como en todo el sistema: quien
     verifica la copia del papel y puede escribirla con puntos o sin ellos. */
  const calza =
    caso.pin === soloDigitos(pinEscrito) &&
    llaveDe(caso.tipoDoc, documentoEscrito) === caso.cedulaBusca;

  if (!calza) {
    const fallos = caso.intentos + 1;
    await bd
      .update(esquema.atencion)
      .set({
        intentosFallidos: fallos,
        bloqueadaHasta:
          fallos >= FALLOS_PERMITIDOS
            ? new Date(Date.now() + MINUTOS_DE_ESPERA * 60_000)
            : null,
      })
      .where(eq(esquema.atencion.id, caso.id));

    if (fallos >= FALLOS_PERMITIDOS) {
      return { estado: 'bloqueado', minutos: MINUTOS_DE_ESPERA };
    }
    return { estado: 'no-calza' };
  }

  // Acertó: la cuenta de fallos vuelve a cero.
  if (caso.intentos > 0 || caso.bloqueadaHasta) {
    await bd
      .update(esquema.atencion)
      .set({ intentosFallidos: 0, bloqueadaHasta: null })
      .where(eq(esquema.atencion.id, caso.id));
  }

  const d = (caso.datos ?? {}) as Record<string, string>;
  const esLab = caso.tipo === 'laboratorio';
  const hojas = esLab ? ['Informe de laboratorio'] : ['Informe de atención médica'];
  if (!esLab && (d.recipe || d.indicaciones)) hojas.push('Récipe');

  /* Quien firma un informe de laboratorio es el bioanalista y no quien
     registró la orden, que casi siempre es recepción. La aseguradora que
     verifica necesita ver el nombre que está impreso en el papel: si acá
     apareciera otro, parecería que el documento no es el que tiene en la
     mano. */
  const [firmante] = esLab && caso.resultadosPor
    ? await bd
        .select({ nombre: esquema.user.name, colegiatura: esquema.user.colegiatura })
        .from(esquema.user)
        .where(eq(esquema.user.id, caso.resultadosPor))
        .limit(1)
    : [];

  return {
    estado: 'ok',
    documento: {
      numero: caso.numero,
      fecha: caso.fecha,
      paciente: caso.paciente,
      documentoPaciente: caso.cedula,
      tipoDoc: caso.tipoDoc,
      medico: firmante?.nombre ?? (esLab ? null : caso.medico),
      colegiatura: firmante?.colegiatura ?? (esLab ? null : caso.colegiatura),
      /* Para no imprimir "C.M." al lado del colegio de un bioanalista. */
      firmaDe: esLab ? 'bioanalista' : 'medico',
      anulada: caso.estado === 'anulada',
      hojas,
    },
  };
}

/**
 * Lo mismo, pero buscando por el N° de atención en vez del id.
 *
 * El QR lleva el id, que es un uuid y nadie va a teclear. Quien no puede
 * escanear tiene que poder verificar igual, y lo que sí está impreso en
 * grande es el N°. El resto de la comprobación es idéntico.
 */
export async function verificarPorNumero(
  numero: string,
  documentoEscrito: string,
  pinEscrito: string,
): Promise<Resultado> {
  const n = Number(soloDigitos(numero));
  if (!Number.isSafeInteger(n) || n <= 0) return { estado: 'no-calza' };

  const [caso] = await bd
    .select({ id: esquema.atencion.id })
    .from(esquema.atencion)
    .where(eq(esquema.atencion.numero, n))
    .limit(1);

  if (!caso) return { estado: 'no-calza' };
  return verificar(caso.id, documentoEscrito, pinEscrito);
}

/**
 * Le pone PIN a una atención que acaba de cerrarse, si no lo tiene.
 *
 * `IS NULL` en el WHERE y no un `if` antes: dos cierres a la vez sobre el
 * mismo caso generarían dos PIN distintos, y el documento que ya se imprimió
 * dejaría de verificarse. El primero que llega gana.
 */
export async function asegurarPin(atencionId: string): Promise<void> {
  await bd
    .update(esquema.atencion)
    .set({ pin: pinNuevo() })
    .where(and(eq(esquema.atencion.id, atencionId), sql`${esquema.atencion.pin} IS NULL`));
}
