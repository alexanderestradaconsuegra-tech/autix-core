import type { PolicyDecision, Principal, ToolContract } from '@autix/contracts';

import type { PolicyEngine } from './policy-engine.js';

/**
 * ScopePolicyEngine (Sprint 6): el motor propio simple que RFC-000 §11 ya
 * decidió usar primero (reglas declarativas, no OPA/Cedar).
 *
 * Reglas v0:
 * 1. Si al Principal le falta alguno de los `requiredScopes` de la Tool →
 *    `deny`.
 * 2. Si tiene todos los scopes pero la Tool es `riskLevel: 'financial'` →
 *    `require_approval` (RFC-000 §11: el "tercer estado", no binario).
 * 3. Si no, `allow`.
 *
 * Esto es un default razonable, no una regla de negocio final — el punto
 * de esta clase implementar el Port `PolicyEngine` es exactamente poder
 * reemplazarla por reglas más ricas (por tenant, por Connector, por
 * umbral de `write_irreversible`) sin tocar el `ExecutionEngine`.
 */
export class ScopePolicyEngine implements PolicyEngine {
  authorize(principal: Principal, tool: ToolContract): PolicyDecision {
    const missingScopes = tool.requiredScopes.filter(
      (scope) => !principal.grantedScopes.includes(scope),
    );

    if (missingScopes.length > 0) {
      return {
        decision: 'deny',
        reason: `Al Principal "${principal.principalId}" le falta(n) scope(s): ${missingScopes.join(', ')}.`,
      };
    }

    if (tool.riskLevel === 'financial') {
      return {
        decision: 'require_approval',
        reason: `"${tool.id}" es de riesgo financiero y requiere aprobación explícita.`,
      };
    }

    return { decision: 'allow' };
  }
}
