import type { ErrorCode } from './errors.js';
import type { ConnectorId, PrincipalId, TenantId, ToolId } from './ids.js';
import type { PolicyDecision } from './policy-decision.js';

/**
 * AuditEvent (RFC-000 §16): un registro append-only de un intento de
 * invocación — se emite para *toda* invocación, exitosa o no, nunca
 * condicionalmente.
 *
 * Simplificaciones deliberadas de v0 (RFC-000 exige más, documentado
 * explícitamente para no confundirlo con deuda):
 * - **Sin `input`.** RFC-000 pide "input (redactado según política de PII
 *   por campo)" — sin una política de redacción real todavía, omitir el
 *   campo es más seguro que guardarlo sin redactar. Se agrega cuando
 *   exista esa política, no antes.
 * - **`toolVersion`/`connectorId`/`decision` son opcionales**: si la
 *   invocación falla antes de resolver la Tool (`NOT_FOUND`), esos datos
 *   nunca existieron — un campo obligatorio ahí obligaría a inventar un
 *   valor falso.
 * - **Retención, inmutabilidad forzada por storage, y "leer auditoría es
 *   en sí una acción auditada"** (RFC-000 §16) no están implementadas —
 *   son del backend de persistencia real, no de este v0 in-memory.
 */
export interface AuditEvent {
  readonly invocationId: string;
  /** ISO 8601. */
  readonly timestamp: string;
  readonly tenantId: TenantId;
  readonly principalId: PrincipalId;
  readonly toolId: ToolId;
  readonly toolVersion?: string;
  readonly connectorId?: ConnectorId;
  readonly decision?: PolicyDecision['decision'];
  readonly outcome: 'success' | 'failure';
  readonly errorCode?: ErrorCode;
  readonly durationMs: number;
}
