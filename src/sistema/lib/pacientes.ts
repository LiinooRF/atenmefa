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
 *   1. El paciente no se crea ni se borra acá. Nace con su primera atención
 *      (pacienteDe en atenciones.ts) y lo único editable es el teléfono: el
 *      nombre y la cédula vienen firmados en cada historia y corregirlos
 *      desde el registro sería pisar el historial sin dejar rastro.
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
import { esIdentificador, normalizar, soloDigitos } from './atenciones';
import { resumir, type CuentaPorMoneda } from './cobro';
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
    id: string; cedula: string; nombre: string; telefono: string | null;
    atenciones: number; ultima: string | null; idx: string | null;
  }>(sql`
    SELECT p.id, p.cedula, p.nombre, p.telefono,
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
    nombre: string;
    telefono: string | null;
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
      nombre: esquema.paciente.nombre,
      telefono: esquema.paciente.telefono,
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
    id: string; numero: number; fecha: string; estado: string;
    idx: string | null; aseguradora: string | null;
    medico: string | null; anulada_motivo: string | null;
  }>(sql`
    SELECT a.id, a.numero::int AS numero, to_char(a.fecha, 'YYYY-MM-DD') AS fecha,
           a.estado::text AS estado,
           NULLIF(trim(a.datos ->> 'idx'), '') AS idx,
           a.aseguradora, a.anulada_motivo,
           u.name AS medico
      FROM atencion a
      LEFT JOIN "user" u ON u.id = a.medico_id
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

/** Los cinco prefijos de celular que se usan en Venezuela. */
const MOVILES = ['412', '414', '416', '424', '426'];

/**
 * Los enlaces de llamada y de WhatsApp de un teléfono tecleado a mano.
 *
 * Acá los números se escriben "0414-893.91.76", y WhatsApp los quiere en
 * internacional sin el cero de salida: 584148939176. El de WhatsApp sale
 * null cuando el número es un fijo o cuando no se puede armar con
 * confianza; un botón que lleva a una conversación que no existe es peor
 * que no tener botón.
 */
export function enlacesDeTelefono(telefono: string | null | undefined) {
  const digitos = soloDigitos(telefono ?? '');
  if (digitos.length < 7) return null;

  const nacional =
    digitos.length === 12 && digitos.startsWith('58') ? digitos.slice(2)
    : digitos.length === 11 && digitos.startsWith('0') ? digitos.slice(1)
    : digitos.length === 10 ? digitos
    : null;

  const esMovil = nacional !== null && MOVILES.includes(nacional.slice(0, 3));

  return {
    /* Con el 58 adelante hace falta el + para que la operadora lo marque
       como internacional; el número local se marca tal cual se escribió. */
    llamar: digitos.startsWith('58') && digitos.length === 12 ? `tel:+${digitos}` : `tel:${digitos}`,
    whatsapp: esMovil ? `https://wa.me/58${nacional}` : null,
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
export async function guardarTelefono(id: string, bruto: unknown) {
  if (!esIdentificador(id)) throw new Error('Ese paciente ya no está en el registro.');

  const texto = String(bruto ?? '').trim();
  const digitos = soloDigitos(texto);

  /* Vacío se acepta a propósito: un número equivocado es peor que ninguno,
     y el que contesta la llamada equivocada también es un paciente. */
  if (texto && (digitos.length < 7 || digitos.length > 15)) {
    throw new Error('El teléfono tiene que tener entre 7 y 15 dígitos, por ejemplo 0414-8939176.');
  }
  if (texto && !/^[+\d\s().-]+$/.test(texto)) {
    throw new Error('El teléfono lleva solo números, espacios y los signos + ( ) - y punto.');
  }

  const [antes] = await bd
    .select({ telefono: esquema.paciente.telefono })
    .from(esquema.paciente)
    .where(eq(esquema.paciente.id, id))
    .limit(1);

  if (!antes) throw new Error('Ese paciente ya no está en el registro.');

  const ahora = texto || null;
  await bd
    .update(esquema.paciente)
    .set({ telefono: ahora })
    .where(eq(esquema.paciente.id, id));

  return { antes: antes.telefono, ahora };
}
