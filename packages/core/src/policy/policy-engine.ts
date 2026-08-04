import type { PolicyDecision, Principal, ToolContract } from '@autix/contracts';

/**
 * PolicyEngine (RFC-000 §9, §11): decide si un Principal puede invocar una
 * Tool — `allow`, `deny`, o `require_approval` (nunca un booleano; ver
 * `PolicyDecision` en `@autix/contracts`).
 *
 * Port, no implementación — `ScopePolicyEngine` (este mismo directorio) es
 * la única por ahora. RFC-000 §11 ya decidió el motor: reglas propias
 * simples primero, con esta interfaz pensada para poder reemplazarla por
 * OPA/Cedar si la complejidad de políticas crece — no es una decisión que
 * este sprint tenga que volver a tomar.
 */
export interface PolicyEngine {
  authorize(principal: Principal, tool: ToolContract): PolicyDecision;
}
