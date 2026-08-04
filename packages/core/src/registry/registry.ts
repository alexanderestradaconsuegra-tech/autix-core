import type {
  AgentContract,
  AgentId,
  CapabilityContract,
  CapabilityId,
  ConnectorId,
  ConnectorManifest,
  ConnectorManifestDocument,
  MarketplaceItemContract,
  ToolContract,
  ToolId,
  WorkflowContract,
  WorkflowId,
} from '@autix/contracts';
import {
  AutixError,
  compareSemver,
  isValidSemver,
  toCapabilityId,
  toConnectorId,
  toToolId,
} from '@autix/contracts';
import { compileJsonSchema } from '@autix/schemas';

import type { EventBus } from '../events/event-bus.js';
import type { CapabilityDiscoveryEntry } from './capability-discovery.js';
import {
  SUPPORTED_MANIFEST_PROTOCOL_VERSIONS,
  parseConnectorManifestDocument,
} from './connector-manifest-document-schema.js';
import type { RegistryStore } from './registry-store.js';
import {
  capabilityManifestEntryToContract,
  toolManifestEntryToContract,
} from './wire-conversion.js';

/**
 * Registry (RFC-000 §6, §13): el catálogo de Connectors y Tools. Es la
 * capa de Application (casos de uso) que aplica las reglas de negocio del
 * registro sobre un `RegistryStore` (Port) — el store en sí no valida
 * nada.
 *
 * Reglas que aplica (todas trazables a RFC-000 §13, §21):
 * - El manifiesto y cada Tool que declara deben tener una versión SemVer
 *   válida.
 * - Cada Tool del manifiesto debe pertenecer al Connector que lo publica
 *   (`tool.connectorId === manifest.connectorId`) — protege contra un
 *   manifiesto corrupto o mal armado que reclame Tools ajenas.
 * - Una Tool no puede volver a registrarse con exactamente la misma
 *   versión (`CONFLICT`) — un fix se publica como una versión nueva
 *   (SemVer), nunca reescribiendo una ya existente.
 * - El manifiesto de un Connector es un snapshot: registrarlo de nuevo
 *   reemplaza el anterior. Sus Tools, en cambio, se acumulan por versión
 *   — el Registry debe poder servir N versiones de una Tool a la vez.
 *
 * `registerConnector` es async desde Sprint 8: emite `ConnectorRegistered`
 * (RFC-000 §18) al `EventBus` tras registrar, y publicar un evento es
 * async incluso en el `InMemoryEventBus`.
 *
 * Simplificación deliberada de Sprint 3 (documentada, no accidental): sin
 * Policy Engine todavía, `discoverTools()` no filtra por permisos — RFC-000
 * §12 exige ese filtrado antes de producción, pero no puede implementarse
 * sin Policy Engine (Sprint futuro). Tampoco hay ciclo de vida
 * `pending → active` (RFC-000 §13): el registro es inmediato.
 *
 * Sprint 13 (RFC-001) agrega el mismo catálogo para Workflows —
 * `registerWorkflow`/`getWorkflow`/`listWorkflowVersions`/`discoverWorkflows`,
 * espejo exacto de los métodos de Tool. `registerWorkflow` valida además la
 * forma del DAG (`steps`/`dependsOn`): ids de step únicos, sin referencias
 * colgantes, sin ciclos — fallar rápido acá evita que el `WorkflowEngine`
 * (que sí ejecuta el DAG) tenga que lidiar con uno corrupto. No valida que
 * los `toolId` referenciados ya existan en el Registry: un Workflow puede
 * componerse antes de que todos sus Connectors estén registrados — esa
 * comprobación es responsabilidad del `WorkflowEngine`, en tiempo de
 * ejecución, igual que `ExecutionEngine.getTool()` ya maneja `NOT_FOUND`.
 *
 * Sprint 14 (Capability Registry): agrega el mismo catálogo para
 * Capabilities — `registerCapability`/`getCapability`/
 * `listCapabilityVersions`, y `discoverCapabilities()` (espejo de
 * `discoverTools()`, pero uniendo cada Capability con las Tools que la
 * implementan). Un Connector deja de ser la unidad central del sistema: es
 * un proveedor de Capabilities, indexado por su relación con ellas, no al
 * revés. `registerConnectorManifestDocument()` es la contraparte de
 * `registerConnector()` para el registro **por wire** (HTTP, JSON puro,
 * independiente del lenguaje del Connector) — valida la forma del
 * documento, resuelve referencias de Capability, compila cada schema de
 * negocio con `ajv` para fallar rápido ante un schema malformado, y solo
 * entonces registra todo o nada, igual que `registerConnector`.
 */
export class Registry {
  constructor(
    private readonly store: RegistryStore,
    private readonly eventBus: EventBus,
  ) {}

  async registerConnector(manifest: ConnectorManifest): Promise<void> {
    this.validateManifest(manifest);

    this.store.saveConnector(manifest);
    for (const tool of manifest.tools) {
      this.store.saveTool(tool);
    }

    await this.eventBus.publish({
      type: 'ConnectorRegistered',
      timestamp: new Date().toISOString(),
      connectorId: manifest.connectorId,
      version: manifest.version,
      toolCount: manifest.tools.length,
    });
  }

  getConnector(connectorId: ConnectorId): ConnectorManifest {
    const manifest = this.store.getConnector(connectorId);
    if (!manifest) {
      throw new AutixError('NOT_FOUND', `Connector "${connectorId}" no está registrado.`, {
        connectorId,
      });
    }
    return manifest;
  }

  listConnectors(): readonly ConnectorManifest[] {
    return this.store.listConnectors();
  }

  /** Todas las versiones registradas de una Tool, de más reciente a más antigua. */
  listToolVersions(toolId: ToolId): readonly ToolContract[] {
    return [...this.store.listToolVersions(toolId)].sort((a, b) =>
      compareSemver(b.version, a.version),
    );
  }

  /**
   * Resuelve una Tool. Sin `version`, devuelve la más reciente registrada
   * (RFC-000 §21).
   */
  getTool(toolId: ToolId, version?: string): ToolContract {
    const versions = this.store.listToolVersions(toolId);

    if (version !== undefined) {
      const exact = versions.find((tool) => tool.version === version);
      if (!exact) {
        throw new AutixError('NOT_FOUND', `Tool "${toolId}@${version}" no está registrada.`, {
          toolId,
          version,
        });
      }
      return exact;
    }

    const latest = this.latestOf(versions);
    if (!latest) {
      throw new AutixError('NOT_FOUND', `Tool "${toolId}" no está registrada.`, { toolId });
    }
    return latest;
  }

  /**
   * Discovery (RFC-000 §12): la última versión de cada Tool registrada,
   * ordenadas por id. Sin filtrado por permisos todavía — ver la nota de
   * la clase.
   */
  discoverTools(): readonly ToolContract[] {
    const latestByToolId = new Map<ToolId, ToolContract>();

    for (const tool of this.store.listAllTools()) {
      const current = latestByToolId.get(tool.id);
      if (!current || compareSemver(tool.version, current.version) > 0) {
        latestByToolId.set(tool.id, tool);
      }
    }

    return Array.from(latestByToolId.values()).sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
  }

  private latestOf(versions: readonly ToolContract[]): ToolContract | undefined {
    return versions.reduce<ToolContract | undefined>((latest, tool) => {
      if (!latest || compareSemver(tool.version, latest.version) > 0) {
        return tool;
      }
      return latest;
    }, undefined);
  }

  /** Registra un Workflow (RFC-001, Sprint 13) — valida SemVer, no-duplicado, y la forma del DAG. */
  registerWorkflow(workflow: WorkflowContract): void {
    this.validateWorkflow(workflow);
    this.store.saveWorkflow(workflow);
  }

  getWorkflow(workflowId: WorkflowId, version?: string): WorkflowContract {
    const versions = this.store.listWorkflowVersions(workflowId);

    if (version !== undefined) {
      const exact = versions.find((workflow) => workflow.version === version);
      if (!exact) {
        throw new AutixError(
          'NOT_FOUND',
          `Workflow "${workflowId}@${version}" no está registrado.`,
          { workflowId, version },
        );
      }
      return exact;
    }

    const latest = this.latestOfWorkflow(versions);
    if (!latest) {
      throw new AutixError('NOT_FOUND', `Workflow "${workflowId}" no está registrado.`, {
        workflowId,
      });
    }
    return latest;
  }

  /** Todas las versiones registradas de un Workflow, de más reciente a más antigua. */
  listWorkflowVersions(workflowId: WorkflowId): readonly WorkflowContract[] {
    return [...this.store.listWorkflowVersions(workflowId)].sort((a, b) =>
      compareSemver(b.version, a.version),
    );
  }

  /** Discovery de Workflows: la última versión de cada uno, ordenados por id. */
  discoverWorkflows(): readonly WorkflowContract[] {
    const latestByWorkflowId = new Map<WorkflowId, WorkflowContract>();

    for (const workflow of this.store.listAllWorkflows()) {
      const current = latestByWorkflowId.get(workflow.id);
      if (!current || compareSemver(workflow.version, current.version) > 0) {
        latestByWorkflowId.set(workflow.id, workflow);
      }
    }

    return Array.from(latestByWorkflowId.values()).sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
  }

  private latestOfWorkflow(versions: readonly WorkflowContract[]): WorkflowContract | undefined {
    return versions.reduce<WorkflowContract | undefined>((latest, workflow) => {
      if (!latest || compareSemver(workflow.version, latest.version) > 0) {
        return workflow;
      }
      return latest;
    }, undefined);
  }

  /**
   * Registra una Capability en proceso (Sprint 14) — sin Connector
   * involucrado, útil para tests o para definir de antemano el vocabulario
   * de negocio que luego un Connector implementará. `registerConnectorManifestDocument`
   * (más abajo) es el camino real por wire.
   */
  registerCapability(capability: CapabilityContract): void {
    this.validateCapabilityVersion(capability);
    this.store.saveCapability(capability);
  }

  getCapability(capabilityId: CapabilityId, version?: string): CapabilityContract {
    const versions = this.store.listCapabilityVersions(capabilityId);

    if (version !== undefined) {
      const exact = versions.find((capability) => capability.version === version);
      if (!exact) {
        throw new AutixError(
          'NOT_FOUND',
          `Capability "${capabilityId}@${version}" no está registrada.`,
          { capabilityId, version },
        );
      }
      return exact;
    }

    const latest = this.latestOfCapability(versions);
    if (!latest) {
      throw new AutixError('NOT_FOUND', `Capability "${capabilityId}" no está registrada.`, {
        capabilityId,
      });
    }
    return latest;
  }

  /** Todas las versiones registradas de una Capability, de más reciente a más antigua. */
  listCapabilityVersions(capabilityId: CapabilityId): readonly CapabilityContract[] {
    return [...this.store.listCapabilityVersions(capabilityId)].sort((a, b) =>
      compareSemver(b.version, a.version),
    );
  }

  /**
   * Discovery capability-céntrico (Sprint 14): la última versión de cada
   * Capability, junto con qué Tools (de qué Connectors) la implementan hoy.
   * Un Agente descubre por `capabilityId` sin necesitar conocer de antemano
   * el nombre de ningún Connector — el Connector queda como un detalle de
   * la implementación elegida.
   *
   * Una Tool cuenta como implementación de la versión mostrada si no fija
   * `implementsCapabilityVersion` (ausente = "la última", mismo default que
   * el resto del Registry) o si la fija exactamente a esa versión.
   */
  discoverCapabilities(): readonly CapabilityDiscoveryEntry[] {
    const latestByCapabilityId = new Map<CapabilityId, CapabilityContract>();
    for (const capability of this.store.listAllCapabilities()) {
      const current = latestByCapabilityId.get(capability.id);
      if (!current || compareSemver(capability.version, current.version) > 0) {
        latestByCapabilityId.set(capability.id, capability);
      }
    }

    const tools = this.discoverTools();

    return Array.from(latestByCapabilityId.values())
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((capability) => ({
        capability,
        implementations: tools
          .filter(
            (tool) =>
              tool.implementsCapability === capability.id &&
              (tool.implementsCapabilityVersion === undefined ||
                tool.implementsCapabilityVersion === capability.version),
          )
          .map((tool) => ({
            connectorId: tool.connectorId,
            toolId: tool.id,
            toolVersion: tool.version,
          })),
      }));
  }

  private latestOfCapability(
    versions: readonly CapabilityContract[],
  ): CapabilityContract | undefined {
    return versions.reduce<CapabilityContract | undefined>((latest, capability) => {
      if (!latest || compareSemver(capability.version, latest.version) > 0) {
        return capability;
      }
      return latest;
    }, undefined);
  }

  private validateCapabilityVersion(capability: CapabilityContract): void {
    if (!isValidSemver(capability.version)) {
      throw new AutixError(
        'VALIDATION_ERROR',
        `La Capability "${capability.id}" tiene una versión inválida: "${capability.version}".`,
        { capabilityId: capability.id, version: capability.version },
      );
    }

    const alreadyRegistered = this.store
      .listCapabilityVersions(capability.id)
      .some((registered) => registered.version === capability.version);
    if (alreadyRegistered) {
      throw new AutixError(
        'CONFLICT',
        `"${capability.id}@${capability.version}" ya está registrada — publicá una versión nueva en vez de reescribirla.`,
        { capabilityId: capability.id, version: capability.version },
      );
    }
  }

  registerAgent(agent: AgentContract): void {
    if (!isValidSemver(agent.version)) {
      throw new AutixError(
        'VALIDATION_ERROR',
        `El Agent "${agent.id}" tiene una versión inválida: "${agent.version}".`,
        { agentId: agent.id, version: agent.version },
      );
    }

    for (const capabilityId of agent.capabilities) {
      const capability = this.getCapability(capabilityId);
      if (!capability) {
        throw new AutixError(
          'NOT_FOUND',
          `El Agent "${agent.id}" referencia una Capability "${capabilityId}" no registrada.`,
          { agentId: agent.id, capabilityId },
        );
      }
    }

    this.store.saveAgent(agent);
  }

  getAgent(agentId: AgentId): AgentContract {
    const agent = this.store.getAgent(agentId);
    if (!agent) {
      throw new AutixError('NOT_FOUND', `Agent "${agentId}" no está registrado.`, { agentId });
    }
    return agent;
  }

  discoverAgents(): readonly AgentContract[] {
    return [...this.store.listAllAgents()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  registerMarketplaceItem(item: MarketplaceItemContract): void {
    if (!isValidSemver(item.version)) {
      throw new AutixError(
        'VALIDATION_ERROR',
        `El MarketplaceItem "${item.id}" tiene una versión inválida: "${item.version}".`,
        { marketplaceItemId: item.id, version: item.version },
      );
    }

    for (const capabilityId of item.capabilitiesProvided) {
      const capability = this.getCapability(capabilityId);
      if (!capability) {
        throw new AutixError(
          'NOT_FOUND',
          `El MarketplaceItem "${item.id}" referencia una Capability "${capabilityId}" no registrada.`,
          { marketplaceItemId: item.id, capabilityId },
        );
      }
    }

    this.store.saveMarketplaceItem(item);
  }

  getMarketplaceItem(connectorId: ConnectorId): MarketplaceItemContract {
    const item = this.store.getMarketplaceItem(connectorId);
    if (!item) {
      throw new AutixError(
        'NOT_FOUND',
        `MarketplaceItem "${connectorId}" no está registrado.`,
        { connectorId },
      );
    }
    return item;
  }

  discoverMarketplaceItems(): readonly MarketplaceItemContract[] {
    return [...this.store.listAllMarketplaceItems()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
  }

  /**
   * Registra un Connector por wire (Sprint 14, Capability Registry):
   * `POST /v1/connectors/register` (`@autix/core-server`) recibe un
   * `ConnectorManifestDocument` (JSON puro) y lo pasa acá tal cual, sin
   * parsear. Reglas, en orden (todo-o-nada: si algo falla, nada se
   * registra):
   *
   * 1. El documento debe tener la forma exacta de `ConnectorManifestDocument`.
   * 2. `protocolVersion` debe ser una versión de formato que este Registry
   *    sepa interpretar (`SUPPORTED_MANIFEST_PROTOCOL_VERSIONS`).
   * 3. Cada Capability declarada: SemVer válido, sin duplicados dentro del
   *    documento, y `id@version` no registrado ya por **ningún** Connector
   *    (una Capability es un vocabulario de negocio compartido, no
   *    propiedad de un Connector — el segundo Connector que la implementa
   *    no la vuelve a declarar, solo la referencia).
   * 4. Cada Tool declarada: `connectorId` coincide con el del manifiesto,
   *    SemVer válido, sin duplicados, y `implementsCapability`
   *    (+`implementsCapabilityVersion`, si la fija) debe resolver a una
   *    Capability ya conocida — declarada en este mismo documento o
   *    previamente en el Registry.
   * 5. Cada schema de negocio (`canonicalInputSchema`/`canonicalOutputSchema`
   *    de una Capability, `inputSchema`/`outputSchema` de una Tool) se
   *    compila con `ajv` acá mismo — un Connector con un JSON Schema
   *    malformado se rechaza al registrarse, no en su primera invocación
   *    real.
   */
  async registerConnectorManifestDocument(document: unknown): Promise<void> {
    const doc: ConnectorManifestDocument = parseConnectorManifestDocument(document);

    if (
      !(SUPPORTED_MANIFEST_PROTOCOL_VERSIONS as readonly string[]).includes(doc.protocolVersion)
    ) {
      throw new AutixError(
        'VALIDATION_ERROR',
        `protocolVersion "${doc.protocolVersion}" no está soportado por este Registry.`,
        { protocolVersion: doc.protocolVersion, supported: SUPPORTED_MANIFEST_PROTOCOL_VERSIONS },
      );
    }

    if (!isValidSemver(doc.connector.version)) {
      throw new AutixError(
        'VALIDATION_ERROR',
        `El Connector "${doc.connector.id}" tiene una versión de manifiesto inválida: "${doc.connector.version}".`,
        { connectorId: doc.connector.id, version: doc.connector.version },
      );
    }

    const connectorId = toConnectorId(doc.connector.id);
    const declaredCapabilityKeys = new Set<string>();

    for (const capabilityEntry of doc.capabilities) {
      if (!isValidSemver(capabilityEntry.version)) {
        throw new AutixError(
          'VALIDATION_ERROR',
          `La Capability "${capabilityEntry.id}" tiene una versión inválida: "${capabilityEntry.version}".`,
          { capabilityId: capabilityEntry.id, version: capabilityEntry.version },
        );
      }

      const key = `${capabilityEntry.id}@${capabilityEntry.version}`;
      if (declaredCapabilityKeys.has(key)) {
        throw new AutixError(
          'VALIDATION_ERROR',
          `El manifiesto declara la Capability "${key}" más de una vez.`,
          { capabilityId: capabilityEntry.id, version: capabilityEntry.version },
        );
      }
      declaredCapabilityKeys.add(key);

      const alreadyRegistered = this.store
        .listCapabilityVersions(toCapabilityId(capabilityEntry.id))
        .some((registered) => registered.version === capabilityEntry.version);
      if (alreadyRegistered) {
        throw new AutixError(
          'CONFLICT',
          `La Capability "${key}" ya está registrada por otro Connector — publicá una versión nueva en vez de reescribirla.`,
          { capabilityId: capabilityEntry.id, version: capabilityEntry.version },
        );
      }

      this.compileWireSchemaOrThrow(capabilityEntry.canonicalInputSchema, capabilityEntry.id);
      this.compileWireSchemaOrThrow(capabilityEntry.canonicalOutputSchema, capabilityEntry.id);
    }

    const seenToolKeys = new Set<string>();

    for (const toolEntry of doc.tools) {
      if (toolEntry.connectorId !== doc.connector.id) {
        throw new AutixError(
          'VALIDATION_ERROR',
          `La Tool "${toolEntry.id}" declara connectorId "${toolEntry.connectorId}", pero el manifiesto es de "${doc.connector.id}".`,
          {
            toolId: toolEntry.id,
            declaredConnectorId: toolEntry.connectorId,
            manifestConnectorId: doc.connector.id,
          },
        );
      }

      if (!isValidSemver(toolEntry.version)) {
        throw new AutixError(
          'VALIDATION_ERROR',
          `La Tool "${toolEntry.id}" tiene una versión inválida: "${toolEntry.version}".`,
          { toolId: toolEntry.id, version: toolEntry.version },
        );
      }

      const toolKey = `${toolEntry.id}@${toolEntry.version}`;
      if (seenToolKeys.has(toolKey)) {
        throw new AutixError(
          'VALIDATION_ERROR',
          `El manifiesto declara "${toolKey}" más de una vez.`,
          {
            toolId: toolEntry.id,
            version: toolEntry.version,
          },
        );
      }
      seenToolKeys.add(toolKey);

      const alreadyRegisteredTool = this.store
        .listToolVersions(toToolId(toolEntry.id))
        .some((registered) => registered.version === toolEntry.version);
      if (alreadyRegisteredTool) {
        throw new AutixError(
          'CONFLICT',
          `"${toolKey}" ya está registrada — publicá una versión nueva en vez de reescribirla.`,
          { toolId: toolEntry.id, version: toolEntry.version },
        );
      }

      this.assertCapabilityReferenceResolves(toolEntry, declaredCapabilityKeys);

      this.compileWireSchemaOrThrow(toolEntry.inputSchema, toolEntry.id);
      this.compileWireSchemaOrThrow(toolEntry.outputSchema, toolEntry.id);
    }

    for (const capabilityEntry of doc.capabilities) {
      this.store.saveCapability(capabilityManifestEntryToContract(capabilityEntry));
    }

    const tools = doc.tools.map((toolEntry) => toolManifestEntryToContract(toolEntry, connectorId));
    this.store.saveConnector({ connectorId, version: doc.connector.version, tools });
    for (const tool of tools) {
      this.store.saveTool(tool);
    }

    await this.eventBus.publish({
      type: 'ConnectorRegistered',
      timestamp: new Date().toISOString(),
      connectorId,
      version: doc.connector.version,
      toolCount: tools.length,
      capabilityCount: doc.capabilities.length,
    });
  }

  private assertCapabilityReferenceResolves(
    toolEntry: ConnectorManifestDocument['tools'][number],
    declaredCapabilityKeys: ReadonlySet<string>,
  ): void {
    const requestedVersion = toolEntry.implementsCapabilityVersion;

    if (requestedVersion !== undefined) {
      if (declaredCapabilityKeys.has(`${toolEntry.implementsCapability}@${requestedVersion}`)) {
        return;
      }
      const alreadyExists = this.store
        .listCapabilityVersions(toCapabilityId(toolEntry.implementsCapability))
        .some((registered) => registered.version === requestedVersion);
      if (!alreadyExists) {
        throw new AutixError(
          'VALIDATION_ERROR',
          `La Tool "${toolEntry.id}" implementa "${toolEntry.implementsCapability}@${requestedVersion}", que no está registrada.`,
          {
            toolId: toolEntry.id,
            capabilityId: toolEntry.implementsCapability,
            version: requestedVersion,
          },
        );
      }
      return;
    }

    const declaredInThisDocument = [...declaredCapabilityKeys].some((key) =>
      key.startsWith(`${toolEntry.implementsCapability}@`),
    );
    if (declaredInThisDocument) {
      return;
    }

    const existsAnyVersion =
      this.store.listCapabilityVersions(toCapabilityId(toolEntry.implementsCapability)).length > 0;
    if (!existsAnyVersion) {
      throw new AutixError(
        'VALIDATION_ERROR',
        `La Tool "${toolEntry.id}" implementa "${toolEntry.implementsCapability}", que no está registrada.`,
        { toolId: toolEntry.id, capabilityId: toolEntry.implementsCapability },
      );
    }
  }

  private compileWireSchemaOrThrow(schema: Record<string, unknown>, ownerId: string): void {
    try {
      compileJsonSchema(schema);
    } catch (error) {
      throw new AutixError(
        'VALIDATION_ERROR',
        `El JSON Schema de "${ownerId}" es inválido: ${error instanceof Error ? error.message : String(error)}.`,
        { ownerId },
      );
    }
  }

  private validateWorkflow(workflow: WorkflowContract): void {
    if (!isValidSemver(workflow.version)) {
      throw new AutixError(
        'VALIDATION_ERROR',
        `El Workflow "${workflow.id}" tiene una versión inválida: "${workflow.version}".`,
        { workflowId: workflow.id, version: workflow.version },
      );
    }

    const alreadyRegistered = this.store
      .listWorkflowVersions(workflow.id)
      .some((registered) => registered.version === workflow.version);
    if (alreadyRegistered) {
      throw new AutixError(
        'CONFLICT',
        `"${workflow.id}@${workflow.version}" ya está registrado — publicá una versión nueva en vez de reescribirla.`,
        { workflowId: workflow.id, version: workflow.version },
      );
    }

    const stepIds = new Set<string>();
    for (const step of workflow.steps) {
      if (stepIds.has(step.id)) {
        throw new AutixError(
          'VALIDATION_ERROR',
          `El Workflow "${workflow.id}" declara el step "${step.id}" más de una vez.`,
          { workflowId: workflow.id, stepId: step.id },
        );
      }
      stepIds.add(step.id);
    }

    for (const step of workflow.steps) {
      for (const dependencyId of step.dependsOn ?? []) {
        if (!stepIds.has(dependencyId)) {
          throw new AutixError(
            'VALIDATION_ERROR',
            `El step "${step.id}" del Workflow "${workflow.id}" depende de "${dependencyId}", que no existe.`,
            { workflowId: workflow.id, stepId: step.id, dependsOn: dependencyId },
          );
        }
      }
    }

    this.assertNoCycles(workflow);
  }

  /** Kahn's algorithm: si no se puede ordenar topológicamente, el DAG tiene un ciclo. */
  private assertNoCycles(workflow: WorkflowContract): void {
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const step of workflow.steps) {
      inDegree.set(step.id, step.dependsOn?.length ?? 0);
    }
    for (const step of workflow.steps) {
      for (const dependencyId of step.dependsOn ?? []) {
        const existing = dependents.get(dependencyId);
        if (existing) {
          existing.push(step.id);
        } else {
          dependents.set(dependencyId, [step.id]);
        }
      }
    }

    const ready = [...inDegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
    let visited = 0;

    while (ready.length > 0) {
      const stepId = ready.pop();
      if (stepId === undefined) break;
      visited += 1;

      for (const dependentId of dependents.get(stepId) ?? []) {
        const remaining = (inDegree.get(dependentId) ?? 0) - 1;
        inDegree.set(dependentId, remaining);
        if (remaining === 0) {
          ready.push(dependentId);
        }
      }
    }

    if (visited !== workflow.steps.length) {
      throw new AutixError(
        'VALIDATION_ERROR',
        `El Workflow "${workflow.id}" tiene un ciclo en su DAG de steps.`,
        { workflowId: workflow.id },
      );
    }
  }

  private validateManifest(manifest: ConnectorManifest): void {
    if (!isValidSemver(manifest.version)) {
      throw new AutixError(
        'VALIDATION_ERROR',
        `El Connector "${manifest.connectorId}" tiene una versión de manifiesto inválida: "${manifest.version}".`,
        { connectorId: manifest.connectorId, version: manifest.version },
      );
    }

    const seenInThisManifest = new Set<string>();

    for (const tool of manifest.tools) {
      if (tool.connectorId !== manifest.connectorId) {
        throw new AutixError(
          'VALIDATION_ERROR',
          `La Tool "${tool.id}" declara connectorId "${tool.connectorId}", pero el manifiesto es de "${manifest.connectorId}".`,
          {
            toolId: tool.id,
            declaredConnectorId: tool.connectorId,
            manifestConnectorId: manifest.connectorId,
          },
        );
      }

      if (!isValidSemver(tool.version)) {
        throw new AutixError(
          'VALIDATION_ERROR',
          `La Tool "${tool.id}" tiene una versión inválida: "${tool.version}".`,
          { toolId: tool.id, version: tool.version },
        );
      }

      const key = `${tool.id}@${tool.version}`;
      if (seenInThisManifest.has(key)) {
        throw new AutixError('VALIDATION_ERROR', `El manifiesto declara "${key}" más de una vez.`, {
          toolId: tool.id,
          version: tool.version,
        });
      }
      seenInThisManifest.add(key);

      const alreadyRegistered = this.store
        .listToolVersions(tool.id)
        .some((registered) => registered.version === tool.version);
      if (alreadyRegistered) {
        throw new AutixError(
          'CONFLICT',
          `"${key}" ya está registrada — publicá una versión nueva en vez de reescribirla.`,
          { toolId: tool.id, version: tool.version },
        );
      }
    }
  }
}
