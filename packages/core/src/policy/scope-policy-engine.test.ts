import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  toCapabilityId,
  toConnectorId,
  toPrincipalId,
  toTenantId,
  toToolId,
  type Principal,
  type RiskLevel,
  type ToolContract,
} from '@autix/contracts';

import { ScopePolicyEngine } from './scope-policy-engine.js';

function principal(grantedScopes: readonly string[]): Principal {
  return {
    principalId: toPrincipalId('hermes-whatsapp'),
    tenantId: toTenantId('campolac'),
    grantedScopes,
  };
}

function tool(riskLevel: RiskLevel, requiredScopes: readonly string[]): ToolContract {
  return {
    id: toToolId('campolac.productos.consultar'),
    connectorId: toConnectorId('campolac'),
    implementsCapability: toCapabilityId('check_price_and_stock'),
    version: '1.0.0',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    riskLevel,
    requiredScopes,
    idempotent: true,
    description: 'Tool de prueba.',
  };
}

describe('ScopePolicyEngine', () => {
  const engine = new ScopePolicyEngine();

  it('allows when the principal has every required scope and the tool is not financial', () => {
    const decision = engine.authorize(
      principal(['campolac:productos:read']),
      tool('read', ['campolac:productos:read']),
    );

    expect(decision).toEqual({ decision: 'allow' });
  });

  it('allows a tool that requires no scopes at all', () => {
    const decision = engine.authorize(principal([]), tool('read', []));

    expect(decision).toEqual({ decision: 'allow' });
  });

  it('denies when the principal is missing a required scope, naming it', () => {
    const decision = engine.authorize(
      principal([]),
      tool('write_reversible', ['campolac:pedidos:write']),
    );

    expect(decision.decision).toBe('deny');
    if (decision.decision === 'deny') {
      expect(decision.reason).toContain('campolac:pedidos:write');
    }
  });

  it('denies when only some of several required scopes are granted', () => {
    const decision = engine.authorize(
      principal(['campolac:pedidos:write']),
      tool('write_reversible', ['campolac:pedidos:write', 'campolac:inventario:write']),
    );

    expect(decision.decision).toBe('deny');
    if (decision.decision === 'deny') {
      expect(decision.reason).toContain('campolac:inventario:write');
      expect(decision.reason).not.toContain('campolac:pedidos:write,');
    }
  });

  it('requires approval for a financial tool even with every scope granted', () => {
    const decision = engine.authorize(
      principal(['campolac:pagos:write']),
      tool('financial', ['campolac:pagos:write']),
    );

    expect(decision.decision).toBe('require_approval');
  });

  it('denies before ever considering approval when scopes are also missing on a financial tool', () => {
    const decision = engine.authorize(principal([]), tool('financial', ['campolac:pagos:write']));

    expect(decision.decision).toBe('deny');
  });
});
