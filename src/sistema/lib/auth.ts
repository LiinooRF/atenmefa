/**
 * Autenticación con Better Auth.
 *
 * Solo usuario y clave: no hay registro abierto ni proveedores sociales.
 * Las cuentas las crea administración, porque esto no es un portal de
 * pacientes sino el sistema interno del centro.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { lt } from 'drizzle-orm';
import { bd } from './base';
import * as esquema from '../base/auth-esquema';
import { entorno, exigido } from './entorno';

const secreto = exigido('AUTH_SECRETO', 'una cadena larga y aleatoria');

export const auth = betterAuth({
  secret: secreto,
  baseURL: entorno('URL_BASE') ?? 'http://localhost:4321',
  basePath: '/sistema/auth',

  database: drizzleAdapter(bd, { provider: 'pg', schema: esquema }),

  emailAndPassword: {
    enabled: true,
    // Nadie se registra solo: las cuentas las crea administración.
    disableSignUp: true,
    requireEmailVerification: false,
    minPasswordLength: 10,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },

  advanced: {
    /* Better Auth guarda la IP de cada sesión por omisión. En local la
       columna queda vacía porque no llegan cabeceras de proxy, pero detrás
       de Traefik se llenaría con las direcciones del personal.
       Se apaga porque no hay una sola pantalla que la lea: un dato personal
       que nadie consulta es puro riesgo guardado. Si alguna vez hace falta
       (ver desde dónde se abrió una sesión), se prende acá y se le pone una
       pantalla; mientras no exista esa pantalla, no se guarda. */
    ipAddress: { disableIpTracking: true },
  },

  databaseHooks: {
    session: {
      create: {
        /* Las sesiones vencidas se quedaban en la tabla para siempre, con su
           user-agent y, hasta hoy, con su IP. Se barren al entrar: es el
           único momento en que alguien escribe acá de todos modos, pasa una
           vez por persona por semana y no necesita tarea programada.
           Efecto secundario buscado: lo que se haya guardado antes de apagar
           el rastreo desaparece solo en una semana, que es lo que dura una
           sesión. */
        after: async () => {
          await bd.delete(esquema.session).where(lt(esquema.session.expiresAt, new Date()));
        },
      },
    },
  },

  /** Campos propios del centro, encima de los de Better Auth. */
  user: {
    additionalFields: {
      rol: { type: 'string', required: true, defaultValue: 'medico', input: false },
      colegiatura: { type: 'string', required: false, input: false },
      msds: { type: 'string', required: false, input: false },
      activo: { type: 'boolean', required: false, defaultValue: true, input: false },
    },
  },
});

export type Usuario = typeof auth.$Infer.Session.user;
