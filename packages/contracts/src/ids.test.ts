import { describe, expect, it } from 'vitest';

import {
  toAgentId,
  toCapabilityId,
  toConnectorId,
  toPrincipalId,
  toTenantId,
  toToolId,
  toWorkflowId,
} from './ids.js';

describe('branded IDs', () => {
  it('accepts a non-empty string and returns it unchanged at runtime', () => {
    expect(toToolId('campolac.pedidos.crear')).toBe('campolac.pedidos.crear');
    expect(toCapabilityId('create_order')).toBe('create_order');
    expect(toConnectorId('campolac')).toBe('campolac');
    expect(toTenantId('campolac')).toBe('campolac');
    expect(toWorkflowId('confirm_order')).toBe('confirm_order');
    expect(toAgentId('hermes')).toBe('hermes');
    expect(toPrincipalId('hermes-whatsapp')).toBe('hermes-whatsapp');
  });

  it('rejects an empty or blank-only value', () => {
    expect(() => toToolId('')).toThrow(/ToolId no puede estar vacío/);
    expect(() => toCapabilityId('   ')).toThrow(/CapabilityId no puede estar vacío/);
  });
});
