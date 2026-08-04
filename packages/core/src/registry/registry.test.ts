import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  toCapabilityId,
  toConnectorId,
  toToolId,
  toWorkflowId,
  type CapabilityContract,
  type CapabilityManifestEntry,
  type ConnectorManifest,
  type ConnectorManifestDocument,
  type DomainEvent,
  type ToolContract,
  type ToolManifestEntry,
  type WorkflowContract,
  type WorkflowStep,
} from '@autix/contracts';

import { InMemoryEventBus } from '../events/in-memory-event-bus.js';
import { InMemoryRegistryStore } from './in-memory-registry-store.js';
import { Registry } from './registry.js';

const CAMPOLAC = toConnectorId('campolac');
const CONSULTAR_PRECIO = toToolId('campolac.productos.consultar');

function tool(overrides: Partial<ToolContract> = {}): ToolContract {
  return {
    id: CONSULTAR_PRECIO,
    connectorId: CAMPOLAC,
    implementsCapability: toCapabilityId('check_price_and_stock'),
    version: '1.0.0',
    inputSchema: z.object({ nombre: z.string() }),
    outputSchema: z.object({ precio: z.number() }),
    riskLevel: 'read',
    requiredScopes: [],
    idempotent: true,
    description: 'Consulta precio y stock en el schema nativo de Campolac.',
    ...overrides,
  };
}

function manifest(overrides: Partial<ConnectorManifest> = {}): ConnectorManifest {
  return { connectorId: CAMPOLAC, version: '0.1.0', tools: [tool()], ...overrides };
}

function buildRegistry(): { registry: Registry; eventBus: InMemoryEventBus } {
  const eventBus = new InMemoryEventBus();
  return { registry: new Registry(new InMemoryRegistryStore(), eventBus), eventBus };
}

describe('Registry.registerConnector — happy path', () => {
  it('registers a connector and its tools so they become resolvable', async () => {
    const { registry } = buildRegistry();

    await registry.registerConnector(manifest());

    expect(registry.getConnector(CAMPOLAC).version).toBe('0.1.0');
    expect(registry.getTool(CONSULTAR_PRECIO).version).toBe('1.0.0');
    expect(registry.discoverTools()).toHaveLength(1);
  });

  it('lets a tool gain a new version without touching the old one', async () => {
    const { registry } = buildRegistry();

    await registry.registerConnector(manifest({ tools: [tool({ version: '1.0.0' })] }));
    await registry.registerConnector(
      manifest({ version: '0.2.0', tools: [tool({ version: '1.1.0' })] }),
    );

    expect(registry.getTool(CONSULTAR_PRECIO, '1.0.0').version).toBe('1.0.0');
    expect(registry.getTool(CONSULTAR_PRECIO, '1.1.0').version).toBe('1.1.0');
    // sin `version`, resuelve la última por SemVer, no por orden de registro
    expect(registry.getTool(CONSULTAR_PRECIO).version).toBe('1.1.0');
  });

  it("resolves 'latest' by SemVer order, not by registration order or string order", async () => {
    const { registry } = buildRegistry();

    await registry.registerConnector(manifest({ tools: [tool({ version: '1.2.0' })] }));
    await registry.registerConnector(
      manifest({ version: '0.2.0', tools: [tool({ version: '1.10.0' })] }),
    );

    // '1.10.0' > '1.2.0' numéricamente, aunque '1.10.0' < '1.2.0' como string
    expect(registry.getTool(CONSULTAR_PRECIO).version).toBe('1.10.0');
  });

  it('registering a connector again replaces its manifest snapshot but keeps registered tool versions', async () => {
    const { registry } = buildRegistry();

    await registry.registerConnector(manifest({ version: '0.1.0' }));
    await registry.registerConnector(
      manifest({ version: '0.2.0', tools: [tool({ version: '1.1.0' })] }),
    );

    expect(registry.getConnector(CAMPOLAC).version).toBe('0.2.0');
    expect(registry.getTool(CONSULTAR_PRECIO, '1.0.0').version).toBe('1.0.0');
  });
});

describe('Registry.registerConnector — invariantes rechazadas', () => {
  it('rejects a manifest with an invalid SemVer version', async () => {
    const { registry } = buildRegistry();

    await expect(
      registry.registerConnector(manifest({ version: 'not-a-version' })),
    ).rejects.toThrow(/versión de manifiesto inválida/);
  });

  it('rejects a tool whose connectorId does not match the manifest', async () => {
    const { registry } = buildRegistry();
    const mismatched = tool({ connectorId: toConnectorId('otro-connector') });

    await expect(registry.registerConnector(manifest({ tools: [mismatched] }))).rejects.toThrow(
      /declara connectorId/,
    );
  });

  it('rejects a tool with an invalid SemVer version', async () => {
    const { registry } = buildRegistry();

    await expect(
      registry.registerConnector(manifest({ tools: [tool({ version: 'v1' })] })),
    ).rejects.toThrow(/versión inválida/);
  });

  it('rejects a manifest that declares the same tool@version twice', async () => {
    const { registry } = buildRegistry();

    await expect(registry.registerConnector(manifest({ tools: [tool(), tool()] }))).rejects.toThrow(
      /más de una vez/,
    );
  });

  it('rejects re-registering the exact same tool@version across two manifests (CONFLICT)', async () => {
    const { registry } = buildRegistry();
    await registry.registerConnector(manifest());

    await expect(registry.registerConnector(manifest({ version: '0.2.0' }))).rejects.toThrow(
      /ya está registrada/,
    );
  });

  it('does not partially register a manifest when one tool fails validation', async () => {
    const { registry } = buildRegistry();
    const valid = tool({ id: toToolId('campolac.otra.tool'), version: '1.0.0' });
    const invalid = tool({ version: 'bad-version' });

    await expect(
      registry.registerConnector(manifest({ tools: [valid, invalid] })),
    ).rejects.toThrow();
    expect(registry.discoverTools()).toHaveLength(0);
  });
});

describe('Registry — recursos inexistentes', () => {
  it('getConnector throws NOT_FOUND for an unregistered connector', () => {
    const { registry } = buildRegistry();

    expect(() => registry.getConnector(toConnectorId('nunca-registrado'))).toThrow(
      /no está registrado/,
    );
  });

  it('getTool throws NOT_FOUND for an unregistered tool or version', async () => {
    const { registry } = buildRegistry();
    await registry.registerConnector(manifest());

    expect(() => registry.getTool(toToolId('nunca-registrada'))).toThrow(/no está registrada/);
    expect(() => registry.getTool(CONSULTAR_PRECIO, '9.9.9')).toThrow(/no está registrada/);
  });
});

describe('Registry.discoverTools / listToolVersions', () => {
  it('discoverTools returns only the latest version of each tool, sorted by id', async () => {
    const { registry } = buildRegistry();
    const otherTool = toToolId('campolac.aaa.primero');

    await registry.registerConnector(
      manifest({ tools: [tool({ id: otherTool, version: '1.0.0' }), tool({ version: '1.0.0' })] }),
    );
    await registry.registerConnector(
      manifest({ version: '0.2.0', tools: [tool({ version: '2.0.0' })] }),
    );

    const discovered = registry.discoverTools();
    expect(discovered.map((t) => `${t.id}@${t.version}`)).toEqual([
      `${otherTool}@1.0.0`,
      `${CONSULTAR_PRECIO}@2.0.0`,
    ]);
  });

  it('listToolVersions returns every registered version, newest first', async () => {
    const { registry } = buildRegistry();

    await registry.registerConnector(manifest({ tools: [tool({ version: '1.0.0' })] }));
    await registry.registerConnector(
      manifest({ version: '0.2.0', tools: [tool({ version: '1.2.0' })] }),
    );
    await registry.registerConnector(
      manifest({ version: '0.3.0', tools: [tool({ version: '1.10.0' })] }),
    );

    expect(registry.listToolVersions(CONSULTAR_PRECIO).map((t) => t.version)).toEqual([
      '1.10.0',
      '1.2.0',
      '1.0.0',
    ]);
  });
});

describe('Registry.registerConnector — evento ConnectorRegistered (RFC-000 §18)', () => {
  it('publishes ConnectorRegistered with the manifest identity and tool count on success', async () => {
    const { registry, eventBus } = buildRegistry();
    const received: DomainEvent[] = [];
    eventBus.subscribe((event) => {
      received.push(event);
    });

    await registry.registerConnector(manifest());

    expect(received).toHaveLength(1);
    const [event] = received;
    expect(event?.type).toBe('ConnectorRegistered');
    if (event?.type === 'ConnectorRegistered') {
      expect(event.connectorId).toBe(CAMPOLAC);
      expect(event.version).toBe('0.1.0');
      expect(event.toolCount).toBe(1);
      expect(typeof event.timestamp).toBe('string');
    }
  });

  it('does not publish ConnectorRegistered when registration is rejected', async () => {
    const { registry, eventBus } = buildRegistry();
    const received: unknown[] = [];
    eventBus.subscribe((event) => {
      received.push(event);
    });

    await expect(
      registry.registerConnector(manifest({ version: 'not-a-version' })),
    ).rejects.toThrow();

    expect(received).toHaveLength(0);
  });
});

const CREAR_PEDIDO = toWorkflowId('campolac.crear-pedido');

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: 'consultar-stock',
    toolId: CONSULTAR_PRECIO,
    inputMapping: () => ({}),
    ...overrides,
  };
}

function workflow(overrides: Partial<WorkflowContract> = {}): WorkflowContract {
  return {
    id: CREAR_PEDIDO,
    name: 'Crear pedido',
    version: '1.0.0',
    description: 'Crea un pedido de Campolac de punta a punta.',
    inputs: z.object({ producto: z.string() }),
    outputs: z.object({ 'consultar-stock': z.unknown() }),
    steps: [step()],
    ...overrides,
  };
}

describe('Registry.registerWorkflow (RFC-001, Sprint 13) — happy path', () => {
  it('registers a workflow so it becomes discoverable and resolvable', () => {
    const { registry } = buildRegistry();

    registry.registerWorkflow(workflow());

    expect(registry.getWorkflow(CREAR_PEDIDO).version).toBe('1.0.0');
    expect(registry.discoverWorkflows()).toHaveLength(1);
  });

  it('resolves an exact version and, without one, the latest by SemVer', () => {
    const { registry } = buildRegistry();

    registry.registerWorkflow(workflow({ version: '1.0.0' }));
    registry.registerWorkflow(workflow({ version: '1.10.0' }));

    expect(registry.getWorkflow(CREAR_PEDIDO, '1.0.0').version).toBe('1.0.0');
    expect(registry.getWorkflow(CREAR_PEDIDO).version).toBe('1.10.0');
  });

  it('discoverWorkflows returns only the latest version, sorted by id, and is a separate catalog from Tools', () => {
    const { registry } = buildRegistry();
    const otherWorkflow = toWorkflowId('campolac.aaa-primero');

    registry.registerWorkflow(workflow({ id: otherWorkflow, version: '1.0.0' }));
    registry.registerWorkflow(workflow({ version: '1.0.0' }));
    registry.registerWorkflow(workflow({ version: '2.0.0' }));

    expect(registry.discoverWorkflows().map((w) => `${w.id}@${w.version}`)).toEqual([
      `${otherWorkflow}@1.0.0`,
      `${CREAR_PEDIDO}@2.0.0`,
    ]);
    // discoverTools no ve Workflows, y viceversa — catálogos separados.
    expect(registry.discoverTools()).toHaveLength(0);
  });
});

describe('Registry.registerWorkflow — invariantes rechazadas', () => {
  it('rejects an invalid SemVer version', () => {
    const { registry } = buildRegistry();

    expect(() => registry.registerWorkflow(workflow({ version: 'not-a-version' }))).toThrow(
      /versión inválida/,
    );
  });

  it('rejects re-registering the exact same workflow@version (CONFLICT)', () => {
    const { registry } = buildRegistry();
    registry.registerWorkflow(workflow());

    expect(() => registry.registerWorkflow(workflow())).toThrow(/ya está registrado/);
  });

  it('rejects a workflow that declares the same step id twice', () => {
    const { registry } = buildRegistry();

    expect(() => registry.registerWorkflow(workflow({ steps: [step(), step()] }))).toThrow(
      /más de una vez/,
    );
  });

  it('rejects a step that dependsOn a step id that does not exist', () => {
    const { registry } = buildRegistry();

    expect(() =>
      registry.registerWorkflow(workflow({ steps: [step({ dependsOn: ['no-existe'] })] })),
    ).toThrow(/no existe/);
  });

  it('rejects a DAG with a cycle', () => {
    const { registry } = buildRegistry();

    expect(() =>
      registry.registerWorkflow(
        workflow({
          steps: [step({ id: 'a', dependsOn: ['b'] }), step({ id: 'b', dependsOn: ['a'] })],
        }),
      ),
    ).toThrow(/ciclo/);
  });
});

describe('Registry — Workflows inexistentes', () => {
  it('getWorkflow throws NOT_FOUND for an unregistered workflow or version', () => {
    const { registry } = buildRegistry();
    registry.registerWorkflow(workflow());

    expect(() => registry.getWorkflow(toWorkflowId('nunca-registrado'))).toThrow(
      /no está registrado/,
    );
    expect(() => registry.getWorkflow(CREAR_PEDIDO, '9.9.9')).toThrow(/no está registrado/);
  });
});

// --- Sprint 14: Capability Registry --------------------------------------

const CHECK_PRICE_AND_STOCK = toCapabilityId('check_price_and_stock');

const NAME_JSON_SCHEMA = {
  type: 'object',
  properties: { nombre: { type: 'string' } },
  required: ['nombre'],
};
const PRICE_JSON_SCHEMA = {
  type: 'object',
  properties: { precio: { type: 'number' } },
  required: ['precio'],
};

function capability(overrides: Partial<CapabilityContract> = {}): CapabilityContract {
  return {
    id: CHECK_PRICE_AND_STOCK,
    version: '1.0.0',
    description: 'Consulta precio y stock disponible de un producto por nombre.',
    riskLevel: 'read',
    compensable: false,
    canonicalInputSchema: z.object({ nombre: z.string() }),
    canonicalOutputSchema: z.object({ precio: z.number() }),
    ...overrides,
  };
}

function capabilityEntry(
  overrides: Partial<CapabilityManifestEntry> = {},
): CapabilityManifestEntry {
  return {
    id: 'check_price_and_stock',
    version: '1.0.0',
    description: 'Consulta precio y stock disponible de un producto por nombre.',
    riskLevel: 'read',
    compensable: false,
    canonicalInputSchema: NAME_JSON_SCHEMA,
    canonicalOutputSchema: PRICE_JSON_SCHEMA,
    ...overrides,
  };
}

function toolEntry(overrides: Partial<ToolManifestEntry> = {}): ToolManifestEntry {
  return {
    id: 'campolac.productos.consultar',
    connectorId: 'campolac',
    version: '1.0.0',
    implementsCapability: 'check_price_and_stock',
    description: 'Réplica de consultar_precio_stock.',
    riskLevel: 'read',
    requiredScopes: [],
    idempotent: true,
    inputSchema: NAME_JSON_SCHEMA,
    outputSchema: PRICE_JSON_SCHEMA,
    ...overrides,
  };
}

function manifestDocument(
  overrides: Partial<ConnectorManifestDocument> = {},
): ConnectorManifestDocument {
  return {
    protocolVersion: '1.0',
    connector: { id: 'campolac', version: '1.0.0', endpoint: { baseUrl: 'http://localhost:4000' } },
    capabilities: [capabilityEntry()],
    tools: [toolEntry()],
    ...overrides,
  };
}

describe('Registry.registerCapability / getCapability / listCapabilityVersions (Sprint 14)', () => {
  it('registers a capability in process so it becomes resolvable', () => {
    const { registry } = buildRegistry();

    registry.registerCapability(capability());

    expect(registry.getCapability(CHECK_PRICE_AND_STOCK).version).toBe('1.0.0');
    expect(registry.listCapabilityVersions(CHECK_PRICE_AND_STOCK)).toHaveLength(1);
  });

  it('resolves the latest version by SemVer, and an exact version when asked', () => {
    const { registry } = buildRegistry();

    registry.registerCapability(capability({ version: '1.0.0' }));
    registry.registerCapability(capability({ version: '1.10.0' }));

    expect(registry.getCapability(CHECK_PRICE_AND_STOCK).version).toBe('1.10.0');
    expect(registry.getCapability(CHECK_PRICE_AND_STOCK, '1.0.0').version).toBe('1.0.0');
  });

  it('rejects an invalid SemVer version', () => {
    const { registry } = buildRegistry();

    expect(() => registry.registerCapability(capability({ version: 'not-a-version' }))).toThrow(
      /versión inválida/,
    );
  });

  it('rejects re-registering the exact same capability@version (CONFLICT)', () => {
    const { registry } = buildRegistry();
    registry.registerCapability(capability());

    expect(() => registry.registerCapability(capability())).toThrow(/ya está registrada/);
  });

  it('getCapability throws NOT_FOUND for an unregistered capability or version', () => {
    const { registry } = buildRegistry();
    registry.registerCapability(capability());

    expect(() => registry.getCapability(toCapabilityId('nunca-registrada'))).toThrow(
      /no está registrada/,
    );
    expect(() => registry.getCapability(CHECK_PRICE_AND_STOCK, '9.9.9')).toThrow(
      /no está registrada/,
    );
  });
});

describe('Registry.discoverCapabilities (Sprint 14)', () => {
  it('joins each capability with the tools (and connectors) that implement it', async () => {
    const { registry } = buildRegistry();

    await registry.registerConnectorManifestDocument(manifestDocument());

    const discovered = registry.discoverCapabilities();
    expect(discovered).toHaveLength(1);
    expect(discovered[0]?.capability.id).toBe(CHECK_PRICE_AND_STOCK);
    expect(discovered[0]?.implementations).toEqual([
      { connectorId: CAMPOLAC, toolId: CONSULTAR_PRECIO, toolVersion: '1.0.0' },
    ]);
  });

  it('a capability with no implementing tool yet still appears, with an empty implementations list', () => {
    const { registry } = buildRegistry();
    registry.registerCapability(capability());

    const discovered = registry.discoverCapabilities();
    expect(discovered).toHaveLength(1);
    expect(discovered[0]?.implementations).toEqual([]);
  });

  it('a tool pinned (implementsCapabilityVersion) to an older capability version does not appear under the latest one', async () => {
    const { registry } = buildRegistry();

    await registry.registerConnectorManifestDocument(
      manifestDocument({
        capabilities: [capabilityEntry({ version: '1.0.0' })],
        tools: [toolEntry({ implementsCapabilityVersion: '1.0.0' })],
      }),
    );
    registry.registerCapability(capability({ version: '2.0.0' }));

    const discovered = registry.discoverCapabilities();
    expect(discovered[0]?.capability.version).toBe('2.0.0');
    expect(discovered[0]?.implementations).toEqual([]);
  });
});

describe('Registry.registerConnectorManifestDocument — happy path (Sprint 14)', () => {
  it('registers the capabilities and tools of a wire manifest so they become resolvable', async () => {
    const { registry } = buildRegistry();

    await registry.registerConnectorManifestDocument(manifestDocument());

    expect(registry.getConnector(CAMPOLAC).version).toBe('1.0.0');
    expect(registry.getCapability(CHECK_PRICE_AND_STOCK).version).toBe('1.0.0');
    expect(registry.getTool(CONSULTAR_PRECIO).implementsCapability).toBe(CHECK_PRICE_AND_STOCK);
  });

  it('lets a second Connector implement an already-registered capability without redeclaring it', async () => {
    const { registry } = buildRegistry();
    await registry.registerConnectorManifestDocument(manifestDocument());

    const otherConnectorTool = toolEntry({
      id: 'otro-connector.consultar-precio',
      connectorId: 'otro-connector',
    });
    await registry.registerConnectorManifestDocument(
      manifestDocument({
        connector: { id: 'otro-connector', version: '1.0.0', endpoint: { baseUrl: 'http://x' } },
        capabilities: [],
        tools: [otherConnectorTool],
      }),
    );

    const discovered = registry.discoverCapabilities();
    expect(discovered[0]?.implementations).toHaveLength(2);
  });

  it('publishes ConnectorRegistered with connectorId, toolCount and capabilityCount', async () => {
    const { registry, eventBus } = buildRegistry();
    const received: DomainEvent[] = [];
    eventBus.subscribe((event) => {
      received.push(event);
    });

    await registry.registerConnectorManifestDocument(manifestDocument());

    expect(received).toHaveLength(1);
    const [event] = received;
    expect(event?.type).toBe('ConnectorRegistered');
    if (event?.type === 'ConnectorRegistered') {
      expect(event.connectorId).toBe(CAMPOLAC);
      expect(event.toolCount).toBe(1);
      expect(event.capabilityCount).toBe(1);
    }
  });
});

describe('Registry.registerConnectorManifestDocument — invariantes rechazadas (Sprint 14)', () => {
  it('rejects a document that does not have the expected shape', async () => {
    const { registry } = buildRegistry();

    await expect(
      registry.registerConnectorManifestDocument({ notEvenClose: true }),
    ).rejects.toThrow(/no tiene la forma esperada/);
  });

  it('rejects an unsupported protocolVersion', async () => {
    const { registry } = buildRegistry();

    await expect(
      registry.registerConnectorManifestDocument(manifestDocument({ protocolVersion: '99.0' })),
    ).rejects.toThrow(/no está soportado/);
  });

  it('rejects an invalid connector SemVer version', async () => {
    const { registry } = buildRegistry();

    await expect(
      registry.registerConnectorManifestDocument(
        manifestDocument({
          connector: { id: 'campolac', version: 'v1', endpoint: { baseUrl: 'http://x' } },
        }),
      ),
    ).rejects.toThrow(/versión de manifiesto inválida/);
  });

  it('rejects a tool whose connectorId does not match the document connector', async () => {
    const { registry } = buildRegistry();

    await expect(
      registry.registerConnectorManifestDocument(
        manifestDocument({ tools: [toolEntry({ connectorId: 'otro' })] }),
      ),
    ).rejects.toThrow(/declara connectorId/);
  });

  it('rejects re-declaring the same capability@version already registered by another Connector (CONFLICT)', async () => {
    const { registry } = buildRegistry();
    await registry.registerConnectorManifestDocument(manifestDocument());

    await expect(
      registry.registerConnectorManifestDocument(
        manifestDocument({
          connector: { id: 'otro-connector', version: '1.0.0', endpoint: { baseUrl: 'http://x' } },
          tools: [toolEntry({ id: 'otro-connector.consultar', connectorId: 'otro-connector' })],
        }),
      ),
    ).rejects.toThrow(/ya está registrada por otro Connector/);
  });

  it('rejects a tool that implements a capability that does not exist anywhere', async () => {
    const { registry } = buildRegistry();

    await expect(
      registry.registerConnectorManifestDocument(
        manifestDocument({
          capabilities: [],
          tools: [toolEntry({ implementsCapability: 'no_existe' })],
        }),
      ),
    ).rejects.toThrow(/que no está registrada/);
  });

  it('rejects a tool that pins implementsCapabilityVersion to a version that does not exist', async () => {
    const { registry } = buildRegistry();

    await expect(
      registry.registerConnectorManifestDocument(
        manifestDocument({
          tools: [toolEntry({ implementsCapabilityVersion: '9.9.9' })],
        }),
      ),
    ).rejects.toThrow(/que no está registrada/);
  });

  it('rejects a malformed JSON Schema in a tool (ajv fails to compile it)', async () => {
    const { registry } = buildRegistry();

    await expect(
      registry.registerConnectorManifestDocument(
        manifestDocument({ tools: [toolEntry({ inputSchema: { type: 'not-a-real-type' } })] }),
      ),
    ).rejects.toThrow(/JSON Schema/);
  });

  it('does not partially register a document when one entry fails validation (all-or-nothing)', async () => {
    const { registry } = buildRegistry();

    await expect(
      registry.registerConnectorManifestDocument(
        manifestDocument({
          tools: [toolEntry(), toolEntry({ id: 'campolac.otra', version: 'bad-version' })],
        }),
      ),
    ).rejects.toThrow();

    expect(registry.discoverTools()).toHaveLength(0);
    expect(registry.discoverCapabilities()).toHaveLength(0);
  });
});
