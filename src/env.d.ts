declare namespace App {
  interface Locals {
    usuario: import('./sistema/lib/auth').Usuario | null;
  }
}

interface ImportMetaEnv {
  readonly BASE_DATOS: string;
  readonly AUTH_SECRETO: string;
  readonly URL_BASE: string;
}
