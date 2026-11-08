/**
 * Registro general de pacientes.
 *
 * Hasta acá al paciente solo se llegaba entrando a una de sus atenciones:
 * no había forma de buscar a alguien por el apellido, ni de ver su historial
 * completo de un barrido, ni de corregirle un teléfono mal tipeado. El
 * cliente lo pidió como "un CRM" y es exactamente eso: la misma gente que
 * ya está en la base, pero mirada por persona en vez de por caso.
 *
 * Dos decisiones mandan sobre este archivo:
 *
 *   1. El paciente se crea, se corrige y —solo si no tiene ni una atención—
 *      se borra desde acá. Lo pidió el cliente para administración y
 *      recepción, que es la mitad de su trabajo. Lo que NO se hace es
 *      juntar dos fichas en silencio, ni borrar a alguien con historia: ver
 *      el bloque de "Crear, corregir y borrar" al final del archivo.
 *   2. Las cuentas no mezclan monedas, igual que en el cobro. El total de
 *      lo que se le facturó a una persona en diez años sigue siendo una
 *      cuenta por moneda; sumar dólares con bolívares daría un número que
 *      no se le puede pasar a nadie.
 *
 * Las consultas se hacen en Postgres y no en memoria. El registro crece con
 * los años y traer la tabla entera para contar atenciones en JavaScript se
 * cae solo cuando el centro lleve dos años andando.
 */
import { eq, sql, type SQL } from 'drizzle-orm';
import { bd, esquema } from './base';
import {
  ROTULO as ROTULO_DOC, alcanza as alcanzaDocumento, esTipo as esTipoDocumento,
  llaveDe as llaveDeDocumento, type TipoDocumento,
} from './documento';
import { esIdentificador, normalizar, soloDigitos } from './atenciones';
import { resumir, type CuentaPorMoneda } from './cobro';
import { correoUsable } from './correo';
import { enlaceDeWhatsApp, esCelular, paraWhatsApp } from './telefono';
import { historia } from '../historia';

/** Pacientes por página. De a cincuenta se desplaza una vez y se ve todo. */
export const POR_PAGINA = 50;

export const ORDENES = [
  { clave: 'nombre', rotulo: 'Paciente' },
  { clave: 'ultima', rotulo: 'Última atención' },
] as const;

export type Orden = (typeof ORDENES)[number]['clave'];

export const esOrden = (valor: unknown): valor is Orden =>
  ORDENES.some((o) => o.clave === valor);

/**
 * Prepara el texto para un LIKE. El % y el guión bajo que alguien teclee en
 * la caja de búsqueda son letras que buscaba, no comodines: sin escaparlos,
 * un "%" solo devuelve el registro completo.
 */
const comoLike = (texto: string) => `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export interface FilaPaciente {
  id: string;
  cedula: string;
  tipoDoc: TipoDocumento;
  nombre: string;
  telefono: string | null;
  atenciones: number;
  ultima: string | null;
  idx: string | null;
}

export interface Listado {
  filas: FilaPaciente[];
  total: number;
  pagina: number;
  paginas: number;
}

/**
 * El filtro de la caja de búsqueda. Una sola caja, dos comparaciones:
 *
 *   · el nombre se compara contra nombre_busca, que está guardado sin
 *     tildes y en minúscula, así "Álvarez" y "alvarez" son lo mismo;
 *   · la cédula se compara por sus dígitos contra cedula_busca, así
 *     "V-12.345.678" y "12345678" encuentran a la misma persona.
 *
 * Van en OR porque quien busca no debería tener que decidir en qué caja
 * escribe: teclea lo que recuerda y el registro se encarga.
 */
function filtroDeBusqueda(busca: string): SQL | null {
  const texto = busca.trim();
  if (!texto) return null;

  const partes: SQL[] = [sql`p.nombre_busca LIKE ${comoLike(normalizar(texto))}`];

  const digitos = soloDigitos(texto);
  if (digitos) partes.push(sql`p.cedula_busca LIKE ${comoLike(digitos)}`);

  return sql.join(partes, sql` OR `);
}

/**
 * La página del registro. Devuelve además el total para poder decir "34
 * pacientes" y para saber cuántas páginas hay: el "siguiente" que lleva a
 * una pantalla vacía es peor que no tenerlo.
 */
export async function listarPacientes(
  opciones: { busca?: string; orden?: Orden; pagina?: number } = {},
): Promise<Listado> {
  const busca = opciones.busca ?? '';
  const orden: Orden = opciones.orden ?? 'nombre';
  const filtro = filtroDeBusqueda(busca);
  const donde = filtro ? sql`WHERE ${filtro}` : sql``;

  const [cuenta] = await bd.execute<{ total: number }>(sql`
    SELECT count(*)::int AS total FROM paciente p ${donde}
  `);
  const total = cuenta?.total ?? 0;

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(Math.max(1, opciones.pagina ?? 1), paginas);

  /* El orden sale de una lista cerrada y nunca del texto que llegó por la
     dirección: acá se está armando SQL a mano. Los pacientes sin ninguna
     atención van al final cuando se ordena por fecha, no primero. */
  const ordenar = orden === 'ultima'
    ? sql`ORDER BY u.ultima DESC NULLS LAST, p.nombre_busca ASC`
    : sql`ORDER BY p.nombre_busca ASC`;

  /* Las anuladas quedaron sin efecto: no cuentan ni como atención ni como
     la última vez que vino. Siguen visibles en su ficha, tachadas. */
  const filas = await bd.execute<{
    id: string; cedula: string; tipo_doc: TipoDocumento; nombre: string; telefono: string | null;
    atenciones: number; ultima: string | null; idx: string | null;
  }>(sql`
    SELECT p.id, p.cedula, p.tipo_doc, p.nombre, p.telefono,
           c.atenciones,
           to_char(u.ultima, 'YYYY-MM-DD') AS ultima,
           u.idx
      FROM paciente p
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS atenciones
          FROM atencion a
         WHERE a.paciente_id = p.id AND a.estado <> 'anulada'
      ) c ON true
      LEFT JOIN LATERAL (
        SELECT a.fecha AS ultima, NULLIF(trim(a.datos ->> 'idx'), '') AS idx
          FROM atencion a
         WHERE a.paciente_id = p.id AND a.estado <> 'anulada'
         ORDER BY a.fecha DESC, a.numero DESC
         LIMIT 1
      ) u ON true
      ${donde}
      ${ordenar}
     LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}
  `);

  return {
    filas: filas.map((f) => ({
      id: f.id,
      cedula: f.cedula,
      tipoDoc: f.tipo_doc,
      nombre: f.nombre,
      telefono: f.telefono,
      atenciones: f.atenciones ?? 0,
      ultima: f.ultima,
      idx: f.idx,
    })),
    total,
    pagina,
    paginas,
  };
}

/* ------------------------------------------------------------------
   La ficha de una persona.
   ------------------------------------------------------------------ */

interface RenglonDeCobro {
  atencion_id: string;
  cantidad: string;
  precio: string;
  moneda: string;
  paga: string;
}

export interface AtencionDePaciente {
  id: string;
  numero: number;
  fecha: string;
  estado: string;
  /** 'general' o 'laboratorio'. Ver 008-laboratorio.sql. */
  tipo: string;
  idx: string | null;
  aseguradora: string | null;
  medico: string | null;
  anuladaMotivo: string | null;
  cuentas: CuentaPorMoneda[];
}

export interface Ficha {
  paciente: {
    id: string;
    cedula: string;
    tipoDoc: TipoDocumento;
    nombre: string;
    telefono: string | null;
    /** Solo si es distinto del teléfono. Ver 010-contacto.sql. */
    whatsapp: string | null;
    correo: string | null;
    sexo: string | null;
    registrado: Date;
  };
  atenciones: AtencionDePaciente[];
  resumen: {
    atenciones: number;
    anuladas: number;
    borradores: number;
    /** Fecha de la primera atención que cuenta. Null si todavía no tiene. */
    desde: string | null;
    facturado: CuentaPorMoneda[];
    seguros: string[];
  };
  /** Los antecedentes, con la atención de la que salieron. */
  antecedentes: {
    numero: number;
    fecha: string;
    campos: { clave: string; rotulo: string; valor: string }[];
  } | null;
  /** Dónde vive y qué edad tenía, con la atención de la que salieron. */
  donde: {
    numero: number;
    fecha: string;
    edad: string;
    direccion: string;
    ciudad: string;
    referencia: string;
  } | null;
}

/**
 * Los antecedentes que un médico necesita antes de tocar al paciente. El
 * orden es el del formulario en papel y los rótulos salen del modelo de la
 * historia, no copiados acá: si mañana el campo cambia de nombre, cambia en
 * las dos pantallas a la vez.
 */
const CLAVES_ANTECEDENTES = [
  'alergias', 'medicacion', 'antecedentes_medicos', 'quirurgicos', 'tabaco', 'alcohol',
] as const;

/**
 * Dónde vive y qué edad tenía. Va aparte de los antecedentes porque se
 * llena en otro momento y de otra manera: el formulario de una atención
 * nueva trae el domicilio precargado de la visita anterior, mientras que
 * las alergias se preguntan y se escriben otra vez cada vez.
 */
const CLAVES_CONTACTO = ['edad', 'direccion', 'ciudad', 'referencia'] as const;

const TODOS_LOS_CAMPOS = historia.flatMap((s) => s.campos);

const rotuloDe = (clave: string) =>
  TODOS_LOS_CAMPOS.find((c) => c.clave === clave)?.rotulo ?? clave;

/**
 * La atención más reciente que dejó escrito alguno de esos campos, con esos
 * campos ya limpios.
 *
 * El "alguno" es lo que importa y no es un detalle de consulta. El guardado
 * automático crea la atención en cuanto el formulario tiene la cédula y el
 * nombre, así que la atención más reciente de un paciente conocido es, casi
 * siempre, una cáscara abierta hace un minuto que todavía no tiene ningún
 * antecedente escrito. Tomarla como fuente dejaba la ficha diciendo "sin
 * dato de alergias" de alguien que tiene "Penicilina" escrito en la visita
 * anterior, y esa es la única línea de esta pantalla que, si no se ve, hace
 * daño.
 */
async function ultimaQueEscribio(pacienteId: string, claves: readonly string[]) {
  const columnas = sql.join(
    claves.map((c) => sql`NULLIF(trim(a.datos ->> ${c}), '') AS ${sql.identifier(c)}`),
    sql`, `,
  );
  const escribioAlgo = sql.join(
    claves.map((c) => sql`NULLIF(trim(a.datos ->> ${c}), '') IS NOT NULL`),
    sql` OR `,
  );

  const [fila] = await bd.execute<Record<string, string | null>>(sql`
    SELECT a.numero::text AS numero, to_char(a.fecha, 'YYYY-MM-DD') AS fecha, ${columnas}
      FROM atencion a
     WHERE a.paciente_id = ${pacienteId}
       AND a.estado <> 'anulada'
       AND (${escribioAlgo})
     ORDER BY a.fecha DESC, a.numero DESC
     LIMIT 1
  `);

  return fila ?? null;
}

/**
 * Una alergia escrita es lo primero que hay que ver, y "ninguna" escrito a
 * mano no es una alergia. Se compara normalizado porque viene tecleado: hay
 * "Ninguna", "ninguna.", "NIEGA".
 */
export function alergiaQueImporta(valor: string | undefined | null) {
  const texto = normalizar(valor ?? '').replace(/[.,;]/g, '').trim();
  if (!texto) return false;
  return !['ninguna', 'ninguno', 'niega', 'no refiere', 'no', 'nada', 'sin alergias']
    .includes(texto);
}

/**
 * Todo lo que la ficha muestra de una persona: sus datos, sus atenciones,
 * los renglones de cobro de todas ellas, los antecedentes y el domicilio.
 *
 * Los renglones se traen juntos y se agrupan acá porque la cuenta la hace
 * resumir(), que es la misma que usan la pantalla de cobro y el cierre del
 * mes: tres pantallas que muestren tres totales distintos del mismo caso es
 * la clase de error que el cliente descubre delante de un paciente.
 */
export async function fichaDePaciente(id: string): Promise<Ficha | null> {
  /* Un id que no tiene forma de uuid hace que Postgres rechace el cast y la
     pantalla termina en error de servidor. Un enlace viejo o mal copiado se
     contesta como lo que es: un paciente que no está. */
  if (!esIdentificador(id)) return null;

  const [persona] = await bd
    .select({
      id: esquema.paciente.id,
      cedula: esquema.paciente.cedula,
      tipoDoc: esquema.paciente.tipoDoc,
      nombre: esquema.paciente.nombre,
      telefono: esquema.paciente.telefono,
      whatsapp: esquema.paciente.whatsapp,
      correo: esquema.paciente.correo,
      sexo: esquema.paciente.sexo,
      registrado: esquema.paciente.creado,
    })
    .from(esquema.paciente)
    .where(eq(esquema.paciente.id, id))
    .limit(1);

  if (!persona) return null;

  /* Van todas, incluidas las anuladas: la ficha las muestra tachadas. Una
     atención que desaparece de la vista es justo lo que una auditoría va a
     preguntar. */
  const crudas = await bd.execute<{
    id: string; numero: number; fecha: string; estado: string; tipo: string;
    idx: string | null; aseguradora: string | null;
    medico: string | null; anulada_motivo: string | null;
  }>(sql`
    SELECT a.id, a.numero::int AS numero, to_char(a.fecha, 'YYYY-MM-DD') AS fecha,
           a.estado::text AS estado, a.tipo::text AS tipo,
           NULLIF(trim(a.datos ->> 'idx'), '') AS idx,
           a.aseguradora, a.anulada_motivo,
           /* Quien lo hizo. En una consulta es el médico; en una orden de
              laboratorio es el bioanalista que firmó, no quien la registró
              en el mesón —que casi siempre es recepción—. Sin esto la ficha
              decía que la hematología la atendió la recepcionista. */
           COALESCE(f.name, u.name) AS medico
      FROM atencion a
      LEFT JOIN "user" u ON u.id = a.medico_id
      LEFT JOIN "user" f ON f.id = a.resultados_por
     WHERE a.paciente_id = ${id}
     ORDER BY a.fecha DESC, a.numero DESC
  `);

  const renglones = await bd.execute<RenglonDeCobro>(sql`
    SELECT r.atencion_id, r.cantidad::text AS cantidad, r.precio::text AS precio,
           r.moneda, r.paga::text AS paga
      FROM renglon r
      JOIN atencion a ON a.id = r.atencion_id
     WHERE a.paciente_id = ${id}
  `);

  const porAtencion = new Map<string, RenglonDeCobro[]>();
  for (const r of renglones) {
    const lista = porAtencion.get(r.atencion_id) ?? [];
    lista.push(r);
    porAtencion.set(r.atencion_id, lista);
  }

  const atenciones: AtencionDePaciente[] = crudas.map((a) => ({
    id: a.id,
    numero: a.numero,
    fecha: a.fecha,
    estado: a.estado,
    tipo: a.tipo,
    idx: a.idx,
    aseguradora: a.aseguradora,
    medico: a.medico,
    anuladaMotivo: a.anulada_motivo,
    cuentas: resumir(porAtencion.get(a.id) ?? []),
  }));

  const cuentan = atenciones.filter((a) => a.estado !== 'anulada');

  /* Lo facturado se cuenta sobre las que valen. Una atención anulada puede
     tener renglones cargados de antes y sumarlos infla la cuenta de la
     persona con plata que nadie va a cobrar. */
  const facturado = resumir(
    renglones.filter((r) => cuentan.some((a) => a.id === r.atencion_id)),
  );

  /* Dos fuentes y no una: los antecedentes salen de la última atención que
     los escribió, el domicilio de la última que lo escribió, y cada bloque
     de la ficha dice de qué atención salió lo que muestra. */
  const [escritos, vive] = await Promise.all([
    ultimaQueEscribio(id, CLAVES_ANTECEDENTES),
    ultimaQueEscribio(id, CLAVES_CONTACTO),
  ]);

  return {
    paciente: persona,
    atenciones,
    resumen: {
      atenciones: cuentan.length,
      anuladas: atenciones.length - cuentan.length,
      borradores: atenciones.filter((a) => a.estado === 'borrador').length,
      desde: cuentan.length ? cuentan[cuentan.length - 1].fecha : null,
      facturado,
      seguros: [...new Set(cuentan.map((a) => a.aseguradora).filter(Boolean) as string[])]
        .sort((a, b) => a.localeCompare(b, 'es')),
    },
    antecedentes: escritos
      ? {
          numero: Number(escritos.numero),
          fecha: String(escritos.fecha),
          campos: CLAVES_ANTECEDENTES
            .filter((c) => escritos[c])
            .map((c) => ({ clave: c, rotulo: rotuloDe(c), valor: String(escritos[c]) })),
        }
      : null,
    donde: vive
      ? {
          numero: Number(vive.numero),
          fecha: String(vive.fecha),
          edad: vive.edad ?? '',
          direccion: vive.direccion ?? '',
          ciudad: vive.ciudad ?? '',
          referencia: vive.referencia ?? '',
        }
      : null,
  };
}

/* ------------------------------------------------------------------
   Llamar y escribir.
   ------------------------------------------------------------------ */

/**
 * Los enlaces de llamada y de WhatsApp de un teléfono tecleado a mano.
 *
 * Acá los números se escriben "0414-893.91.76", y WhatsApp los quiere en
 * internacional sin el cero de salida: 584148939176. El de WhatsApp sale
 * null cuando el número es un fijo o cuando no se puede armar con
 * confianza; un botón que lleva a una conversación que no existe es peor
 * que no tener botón.
 */
export function enlacesDeTelefono(
  telefono: string | null | undefined,
  /* El mensaje predeterminado, si hay algo que decirle. Sin él el enlace
     abre el chat vacío. */
  mensaje?: string,
) {
  const digitos = soloDigitos(telefono ?? '');
  if (digitos.length < 7) return null;

  /* La normalización vive en lib/telefono.ts y es una sola: acá había una
     copia, y dos copias de la misma regla se separan el primer día que
     alguien corrige una. */
  const internacional = paraWhatsApp(telefono);
  const esMovil = esCelular(telefono);

  return {
    /* Con el 58 adelante hace falta el + para que la operadora lo marque
       como internacional; el número local se marca tal cual se escribió. */
    llamar: digitos.startsWith('58') && digitos.length === 12 ? `tel:+${digitos}` : `tel:${digitos}`,
    whatsapp: esMovil && internacional
      ? (mensaje ? enlaceDeWhatsApp(internacional, mensaje) : `https://wa.me/${internacional}`)
      : null,
    esMovil,
  };
}

/**
 * Corrige el teléfono del paciente. Es el único dato que se edita desde el
 * registro: el nombre y la cédula vienen de las atenciones firmadas.
 *
 * Devuelve lo que había antes para poder dejarlo en la bitácora. Un dato de
 * contacto que cambia sin rastro es un dato en el que no se puede confiar.
 */
export async function guardarContacto(
  id: string,
  bruto: { telefono?: unknown; whatsapp?: unknown; correo?: unknown },
) {
  if (!esIdentificador(id)) throw new Error('Ese paciente ya no está en el registro.');

  const contacto = revisarContacto(bruto);

  const [antes] = await bd
    .select({
      telefono: esquema.paciente.telefono,
      whatsapp: esquema.paciente.whatsapp,
      correo: esquema.paciente.correo,
    })
    .from(esquema.paciente)
    .where(eq(esquema.paciente.id, id))
    .limit(1);

  if (!antes) throw new Error('Ese paciente ya no está en el registro.');

  await bd.update(esquema.paciente).set(contacto).where(eq(esquema.paciente.id, id));

  /* Se devuelve qué cambió de verdad, no todo: en bitácora, una línea que
     dice "guardó el contacto" sin decir qué movió no sirve para nada. */
  const cambios: Record<string, { antes: string | null; ahora: string | null }> = {};
  for (const clave of ['telefono', 'whatsapp', 'correo'] as const) {
    if (antes[clave] !== contacto[clave]) {
      cambios[clave] = { antes: antes[clave], ahora: contacto[clave] };
    }
  }

  return { cambios, cuantos: Object.keys(cambios).length };
}

/* ------------------------------------------------------------------
   Crear, corregir y borrar.
   ------------------------------------------------------------------

   El cliente lo pidió explícito: administración y recepción tienen las
   cuatro operaciones sobre el paciente. Hasta acá el paciente solo nacía
   con su primera atención, y lo único editable era el contacto.

   Tres límites, y los tres por la misma razón —el registro tiene que poder
   mirarse a los ojos dentro de cinco años—:

     · el DOCUMENTO se corrige, pero no se fusiona. Si el número nuevo ya es
       de otra persona, la operación se rechaza y se dice de quién es. Mover
       las atenciones de una ficha a otra y elegir qué nombre gana es otra
       cosa, y hacerla en silencio es como se corrompe un registro;
     · lo que se corrige queda en bitácora, con lo que decía antes;
     · se BORRA solo a quien no tiene ni una atención. Un paciente con
       historia no se borra nunca: se corrige. Lo que esto resuelve es el
       error de tipeo que crea una persona que no existe, que en una
       recepción apurada pasa el primer día.
   ------------------------------------------------------------------ */

export interface DatosDeIdentidad {
  nombre: unknown;
  tipoDoc: unknown;
  documento: unknown;
  sexo: unknown;
}

/** Valida nombre, documento y sexo. Lanza con el motivo. */
function revisarIdentidad(datos: DatosDeIdentidad) {
  const nombre = String(datos.nombre ?? '').replace(/\s+/g, ' ').trim();
  if (nombre.length < 3) {
    throw new Error('El nombre del paciente hace falta, con al menos tres letras.');
  }

  const tipo = esTipoDocumento(datos.tipoDoc) ? datos.tipoDoc : 'cedula';
  const documento = String(datos.documento ?? '').trim();
  if (!alcanzaDocumento(tipo, documento)) {
    throw new Error(
      tipo === 'cedula'
        ? 'La cédula hace falta, con al menos seis dígitos.'
        : `El ${ROTULO_DOC[tipo].toLowerCase()} hace falta.`,
    );
  }

  const llave = llaveDeDocumento(tipo, documento);
  if (!llave) throw new Error('Ese documento no se puede leer.');

  const sexo = String(datos.sexo ?? '').trim();
  if (sexo && !['Femenino', 'Masculino'].includes(sexo)) {
    throw new Error('El sexo tiene que ser Femenino o Masculino, o quedar en blanco.');
  }

  return { nombre, tipo, documento, llave, sexo: sexo || null };
}

/** Quién tiene ya ese documento, si alguien lo tiene. */
async function quienTiene(llave: string) {
  const [ya] = await bd
    .select({ id: esquema.paciente.id, nombre: esquema.paciente.nombre, cedula: esquema.paciente.cedula })
    .from(esquema.paciente)
    .where(eq(esquema.paciente.cedulaBusca, llave))
    .limit(1);
  return ya ?? null;
}

/**
 * Crea un paciente sin abrir una atención.
 *
 * Es la mitad del trabajo de recepción que faltaba: alguien llama para
 * pedir una cita, o llega a preguntar, y se registra ahí mismo sin
 * inventarle una consulta que no tuvo.
 */
export async function crearPaciente(
  datos: DatosDeIdentidad & { telefono?: unknown; whatsapp?: unknown; correo?: unknown },
) {
  const id = revisarIdentidad(datos);
  const contacto = revisarContacto(datos);

  const ya = await quienTiene(id.llave);
  if (ya) {
    throw new Error(
      `Ya hay un paciente con ese documento: ${ya.nombre} (${ya.cedula}). Búsquelo en el registro en vez de crearlo otra vez.`,
    );
  }

  const [creado] = await bd
    .insert(esquema.paciente)
    .values({
      cedula: id.documento,
      cedulaBusca: id.llave,
      tipoDoc: id.tipo,
      nombre: id.nombre,
      nombreBusca: normalizar(id.nombre),
      sexo: id.sexo,
      ...contacto,
    })
    .returning({ id: esquema.paciente.id, nombre: esquema.paciente.nombre, cedula: esquema.paciente.cedula });

  return creado;
}

/** Valida los tres datos de contacto. Vacío se acepta en los tres. */
function revisarContacto(bruto: { telefono?: unknown; whatsapp?: unknown; correo?: unknown }) {
  const numero = (texto: string, cual: string) => {
    const digitos = soloDigitos(texto);
    if (texto && (digitos.length < 7 || digitos.length > 15)) {
      /* Dice cuántos contó. El mensaje de antes mostraba un ejemplo
         correcto al lado de lo que la persona había escrito y no se
         entendía qué estaba mal: un guion de más o un dígito de menos se
         ven iguales en pantalla. */
      throw new Error(
        `El ${cual} tiene ${digitos.length} ${digitos.length === 1 ? 'dígito' : 'dígitos'} y ` +
        'tiene que tener entre 7 y 15. Un celular va así: 0414-8939176.',
      );
    }
    if (texto && !/^[+\d\s().-]+$/.test(texto)) {
      throw new Error(`El ${cual} lleva solo números, espacios y los signos + ( ) - y punto.`);
    }
    return texto || null;
  };

  const correoTexto = String(bruto.correo ?? '').trim().toLowerCase();
  if (correoTexto && !correoUsable(correoTexto)) {
    throw new Error('Ese correo no parece válido. Tiene que ser del tipo nombre@correo.com.');
  }

  return {
    telefono: numero(String(bruto.telefono ?? '').trim(), 'teléfono'),
    whatsapp: numero(String(bruto.whatsapp ?? '').trim(), 'WhatsApp'),
    correo: correoTexto || null,
  };
}

/**
 * Corrige al paciente: nombre, documento, sexo y contacto.
 *
 * Devuelve qué cambió y qué decía antes, para la bitácora. Un dato de una
 * persona que cambia sin rastro es un dato en el que no se puede confiar.
 */
export async function guardarPaciente(
  id: string,
  datos: DatosDeIdentidad & { telefono?: unknown; whatsapp?: unknown; correo?: unknown },
) {
  if (!esIdentificador(id)) throw new Error('Ese paciente ya no está en el registro.');

  const nuevo = revisarIdentidad(datos);
  const contacto = revisarContacto(datos);

  const [antes] = await bd
    .select({
      nombre: esquema.paciente.nombre,
      cedula: esquema.paciente.cedula,
      tipoDoc: esquema.paciente.tipoDoc,
      cedulaBusca: esquema.paciente.cedulaBusca,
      sexo: esquema.paciente.sexo,
      telefono: esquema.paciente.telefono,
      whatsapp: esquema.paciente.whatsapp,
      correo: esquema.paciente.correo,
    })
    .from(esquema.paciente)
    .where(eq(esquema.paciente.id, id))
    .limit(1);

  if (!antes) throw new Error('Ese paciente ya no está en el registro.');

  /* El documento cambió y el nuevo ya es de otro: no se fusiona nada. Dos
     fichas de la misma persona son un problema, pero juntarlas en silencio
     —mover atenciones, elegir qué nombre gana— es un problema peor. */
  if (nuevo.llave !== antes.cedulaBusca) {
    const otro = await quienTiene(nuevo.llave);
    if (otro) {
      throw new Error(
        `Ese documento ya es de ${otro.nombre} (${otro.cedula}). Si son la misma persona, hay que juntar las dos fichas a mano: avise para hacerlo con cuidado.`,
      );
    }
  }

  await bd
    .update(esquema.paciente)
    .set({
      nombre: nuevo.nombre,
      nombreBusca: normalizar(nuevo.nombre),
      cedula: nuevo.documento,
      cedulaBusca: nuevo.llave,
      tipoDoc: nuevo.tipo,
      sexo: nuevo.sexo,
      ...contacto,
    })
    .where(eq(esquema.paciente.id, id));

  const ahora: Record<string, string | null> = {
    nombre: nuevo.nombre,
    documento: nuevo.documento,
    tipoDoc: nuevo.tipo,
    sexo: nuevo.sexo,
    ...contacto,
  };
  const antesPlano: Record<string, string | null> = {
    nombre: antes.nombre,
    documento: antes.cedula,
    tipoDoc: antes.tipoDoc,
    sexo: antes.sexo,
    telefono: antes.telefono,
    whatsapp: antes.whatsapp,
    correo: antes.correo,
  };

  const cambios: Record<string, { antes: string | null; ahora: string | null }> = {};
  for (const clave of Object.keys(ahora)) {
    if (antesPlano[clave] !== ahora[clave]) {
      cambios[clave] = { antes: antesPlano[clave], ahora: ahora[clave] };
    }
  }

  return { cambios, cuantos: Object.keys(cambios).length };
}

/**
 * Si se puede borrar, y si no, por qué no.
 *
 * Un paciente con una sola atención no se borra ni con la atención anulada:
 * lo que se le escribió existió y la bitácora lo apunta. Lo que sí se borra
 * es la ficha vacía que nadie atendió nunca.
 */
export async function puedeBorrarse(id: string) {
  if (!esIdentificador(id)) return { puede: false, atenciones: 0, motivo: 'Ese paciente ya no está en el registro.' };

  const [cuenta] = await bd.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM atencion WHERE paciente_id = ${id}
  `);
  const n = Number(cuenta?.n ?? 0);

  if (n > 0) {
    return {
      puede: false,
      atenciones: n,
      motivo: `Tiene ${n} ${n === 1 ? 'atención registrada' : 'atenciones registradas'}. Un paciente con historia no se borra: se corrige.`,
    };
  }
  return { puede: true, atenciones: 0, motivo: '' };
}

/**
 * Borra una ficha vacía.
 *
 * Es lo único que se borra de verdad en todo el sistema, y se puede porque
 * una ficha sin atenciones no tiene un solo dato clínico adentro: es un
 * error de tipeo con nombre. La comprobación se repite dentro de la
 * transacción y el borrado lleva el paciente_id en el WHERE: entre que la
 * pantalla preguntó y el botón se apretó, alguien pudo haberle abierto una
 * atención.
 */
export async function borrarPaciente(id: string) {
  if (!esIdentificador(id)) throw new Error('Ese paciente ya no está en el registro.');

  return bd.transaction(async (tx) => {
    const [fila] = await tx
      .select({ nombre: esquema.paciente.nombre, cedula: esquema.paciente.cedula })
      .from(esquema.paciente)
      .where(eq(esquema.paciente.id, id))
      .limit(1);
    if (!fila) throw new Error('Ese paciente ya no está en el registro.');

    const [cuenta] = await tx.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n FROM atencion WHERE paciente_id = ${id}
    `);
    if (Number(cuenta?.n ?? 0) > 0) {
      throw new Error('Le abrieron una atención mientras miraba esta pantalla, así que ya no se puede borrar.');
    }

    await tx.delete(esquema.paciente).where(eq(esquema.paciente.id, id));
    return fila;
  });
}
