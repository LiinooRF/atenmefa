/**
 * Autenticación con Better Auth.
 *
 * Solo usuario y clave: no hay registro abierto ni proveedores sociales.
 * Las cuentas las crea administración, porque esto no es un portal de
 * pacientes sino el sistema interno del centro.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
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
