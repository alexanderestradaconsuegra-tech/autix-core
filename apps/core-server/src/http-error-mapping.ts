import { AutixError, type AutixErrorShape, type ErrorCode } from '@autix/contracts';

/**
 * Mapea un `ErrorCode` (RFC-000 §15) al status HTTP que esta API usa hacia
 * agentes. Es una decisión de esta capa HTTP únicamente — el resto del
 * runtime (`ExecutionEngine`, `PolicyEngine`, etc.) no sabe qué es HTTP, solo
 * conoce `ErrorCode`/`AutixErrorShape`.
 *
 * `APPROVAL_REQUIRED` usa 202 (Accepted): la invocación fue entendida y es
 * válida, pero no se ejecutó — queda pendiente de una confirmación humana
 * que todavía no existe como canal (ver `ExecutionEngine`).
 */
const ERROR_CODE_TO_HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  APPROVAL_REQUIRED: 202,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  CONNECTOR_UNAVAILABLE: 503,
  CONNECTOR_ERROR: 502,
  INTERNAL_ERROR: 500,
  /** Sprint 13: un Workflow excedió su `timeout`. */
  TIMEOUT: 504,
};

export function errorCodeToHttpStatus(code: ErrorCode): number {
  return ERROR_CODE_TO_HTTP_STATUS[code];
}

/** Convierte cualquier error atrapado en un route handler a `AutixErrorShape` — un error que no es `AutixError` (un bug, no una regla de negocio) se mapea a `INTERNAL_ERROR`. */
export function toErrorShape(error: unknown): AutixErrorShape {
  return error instanceof AutixError
    ? error.toShape()
    : { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) };
}
