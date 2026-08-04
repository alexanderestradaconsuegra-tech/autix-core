/**
 * Modelo de errores común de Autix Core (RFC-000 §15).
 *
 * Un Connector se ejecuta out-of-process (RFC-000 §22) y le habla al Core
 * por red, así que cualquier error que cruce esa frontera tiene que ser un
 * objeto serializable (JSON), no una instancia de `Error` de JavaScript
 * (que no sobrevive intacta un `JSON.stringify`/`parse`). `AutixErrorShape`
 * es esa forma serializable; `AutixError` es una clase de conveniencia para
 * lanzar/atrapar errores dentro de un mismo proceso (con stack trace real e
 * `instanceof`), que sabe convertirse a su forma serializable con
 * `toShape()` en el momento de cruzar esa frontera.
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'APPROVAL_REQUIRED',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'CONNECTOR_UNAVAILABLE',
  'CONNECTOR_ERROR',
  'INTERNAL_ERROR',
  /** Sprint 13: un `Workflow` excedió su `timeout` — distinto de un Connector caído. */
  'TIMEOUT',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

export interface AutixErrorShape {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class AutixError extends Error implements AutixErrorShape {
  readonly code: ErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(code: ErrorCode, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = 'AutixError';
    this.code = code;
    this.details = details;
  }

  toShape(): AutixErrorShape {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }
}
