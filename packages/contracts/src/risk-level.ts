/**
 * Nivel de riesgo de una Tool o Capability (RFC-000 §8, RFC-001 §5).
 *
 * Es información de negocio de primera clase que alimenta al Policy Engine
 * (RFC-000 §9, §11) — nunca un detalle de implementación de un Connector.
 */
export const RISK_LEVELS = ['read', 'write_reversible', 'write_irreversible', 'financial'] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

export function isRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === 'string' && (RISK_LEVELS as readonly string[]).includes(value);
}
