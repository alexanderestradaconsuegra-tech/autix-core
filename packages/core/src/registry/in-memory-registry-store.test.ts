import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  toCapabilityId,
  toConnectorId,
  toToolId,
  toWorkflowId,
  type CapabilityContract,
  type ConnectorManifest,
  type ToolContract,
  type WorkflowContract,
} from '@autix/contracts';

import { InMemoryRegistryStore } from './in-memory-registry-store.js';

function buildCapability(version: string): CapabilityContract {
  return {
    id: toCapabilityId('check_price_and_stock'),
    version,
    description: 'Consulta precio y stock disponible de un producto por nombre.',
    riskLevel: 'read',
    compensable: false,
    canonicalInputSchema: z.object({ nombre: z.string() }),
    canonicalOutputSchema: z.object({ precio: z.number() }),
  };
}

function buildWorkflow(version: string): WorkflowContract {
  return {
    id: toWorkflowId('campolac.crear-pedido'),
    name: 'Crear pedido',
    version,
    description: 'Crea un pedido de Campolac de punta a punta.',
    inputs: z.object({ producto: z.string() }),
    outputs: z.unknown(),
    steps: [
      {
        id: 'consultar-stock',
        toolId: toToolId('campolac.productos.consultar'),
        inputMapping: () => ({}),
      },
    ],
  };
}

function buildTool(version: string): ToolContract {
  return {
    id: toToolId('campolac.productos.consultar'),
    connectorId: toConnectorId('campolac'),
    implementsCapability: toCapabilityId('check_price_and_stock'),
    version,
    inputSchema: z.object({ nombre: z.string() }),
    outputSchema: z.object({ precio: z.number() }),
    riskLevel: 'read',
    requiredScopes: [],
    idempotent: true,
    description: 'consulta precio',
  };
}

function buildManifest(version: string, tools: readonly ToolContract[]): ConnectorManifest {
  return { connectorId: toConnectorId('campolac'), version, tools };
}

describe('InMemoryRegistryStore', () => {
  it('has no connectors or tools before anything is saved', () => {
    const store = new InMemoryRegistryStore();

    expect(store.listConnectors()).toEqual([]);
    expect(store.listAllTools()).toEqual([]);
    expect(store.getConnector(toConnectorId('campolac'))).toBeUndefined();
  });

  it('saveConnector replaces the previous manifest for the same connectorId', () => {
    const store = new InMemoryRegistryStore();

    store.saveConnector(buildManifest('0.1.0', []));
    store.saveConnector(buildManifest('0.2.0', []));

    expect(store.listConnectors()).toHaveLength(1);
    expect(store.getConnector(toConnectorId('campolac'))?.version).toBe('0.2.0');
  });

  it('saveTool accumulates versions instead of replacing them', () => {
    const store = new InMemoryRegistryStore();

    store.saveTool(buildTool('1.0.0'));
    store.saveTool(buildTool('1.1.0'));

    const versions = store.listToolVersions(toToolId('campolac.productos.consultar'));
    expect(versions.map((tool) => tool.version)).toEqual(['1.0.0', '1.1.0']);
    expect(store.listAllTools()).toHaveLength(2);
  });

  it('saveWorkflow accumulates versions instead of replacing them (Sprint 13)', () => {
    const store = new InMemoryRegistryStore();

    store.saveWorkflow(buildWorkflow('1.0.0'));
    store.saveWorkflow(buildWorkflow('1.1.0'));

    const versions = store.listWorkflowVersions(toWorkflowId('campolac.crear-pedido'));
    expect(versions.map((workflow) => workflow.version)).toEqual(['1.0.0', '1.1.0']);
    expect(store.listAllWorkflows()).toHaveLength(2);
  });

  it('has no workflows before anything is saved, separate from the tool catalog', () => {
    const store = new InMemoryRegistryStore();

    expect(store.listAllWorkflows()).toEqual([]);
    expect(store.listWorkflowVersions(toWorkflowId('nunca-registrado'))).toEqual([]);
  });

  it('saveCapability accumulates versions instead of replacing them (Sprint 14)', () => {
    const store = new InMemoryRegistryStore();

    store.saveCapability(buildCapability('1.0.0'));
    store.saveCapability(buildCapability('1.1.0'));

    const versions = store.listCapabilityVersions(toCapabilityId('check_price_and_stock'));
    expect(versions.map((capability) => capability.version)).toEqual(['1.0.0', '1.1.0']);
    expect(store.listAllCapabilities()).toHaveLength(2);
  });

  it('has no capabilities before anything is saved, separate from the tool and workflow catalogs', () => {
    const store = new InMemoryRegistryStore();

    expect(store.listAllCapabilities()).toEqual([]);
    expect(store.listCapabilityVersions(toCapabilityId('nunca-registrada'))).toEqual([]);
  });
});
