import type {
  AgentContract,
  AgentId,
  CapabilityContract,
  CapabilityId,
  ConnectorId,
  ConnectorManifest,
  MarketplaceItemContract,
  ToolContract,
  ToolId,
  WorkflowContract,
  WorkflowId,
} from '@autix/contracts';

/**
 * Port (RFC-000 §3, §24): el `Registry` (misma carpeta, `registry.ts`) es
 * el único que conoce esta interfaz — nunca importa una implementación
 * concreta directamente. Esto es lo que permite reemplazar
 * `InMemoryRegistryStore` (Sprint 3) por un store respaldado en
 * Postgres/Supabase más adelante sin tocar ninguna regla de negocio del
 * Registry.
 *
 * Nótese que este Port no valida nada ni resuelve versiones — es
 * almacenamiento puro. Toda regla (versionado, invariantes del manifiesto)
 * vive en `Registry`, no aquí.
 *
 * Sprint 13 (RFC-001): agrega el almacenamiento de `WorkflowContract`,
 * espejo exacto del de Tools (se acumulan por versión, mismo motivo: N
 * versiones de un Workflow pueden convivir en producción) — "el Registry
 * deberá soportar ambos mecanismos de descubrimiento".
 *
 * Sprint 14 (Capability Registry): agrega el almacenamiento de
 * `CapabilityContract`, mismo patrón — antes de este sprint el tipo existía
 * pero el Registry nunca lo indexaba; cada `ToolContract.implementsCapability`
 * era una referencia suelta que nadie validaba.
 */
export interface RegistryStore {
  saveConnector(manifest: ConnectorManifest): void;
  getConnector(connectorId: ConnectorId): ConnectorManifest | undefined;
  listConnectors(): readonly ConnectorManifest[];

  saveTool(tool: ToolContract): void;
  /** Todas las versiones registradas de una Tool, en el orden en que se guardaron. */
  listToolVersions(toolId: ToolId): readonly ToolContract[];
  /** Todas las Tools, todas sus versiones, sin filtrar ni deduplicar. */
  listAllTools(): readonly ToolContract[];

  saveWorkflow(workflow: WorkflowContract): void;
  /** Todas las versiones registradas de un Workflow, en el orden en que se guardaron. */
  listWorkflowVersions(workflowId: WorkflowId): readonly WorkflowContract[];
  /** Todos los Workflows, todas sus versiones, sin filtrar ni deduplicar. */
  listAllWorkflows(): readonly WorkflowContract[];

  saveCapability(capability: CapabilityContract): void;
  /** Todas las versiones registradas de una Capability, en el orden en que se guardaron. */
  listCapabilityVersions(capabilityId: CapabilityId): readonly CapabilityContract[];
  /** Todas las Capabilities, todas sus versiones, sin filtrar ni deduplicar. */
  listAllCapabilities(): readonly CapabilityContract[];

  saveAgent(agent: AgentContract): void;
  getAgent(agentId: AgentId): AgentContract | undefined;
  listAllAgents(): readonly AgentContract[];

  saveMarketplaceItem(item: MarketplaceItemContract): void;
  getMarketplaceItem(connectorId: ConnectorId): MarketplaceItemContract | undefined;
  listAllMarketplaceItems(): readonly MarketplaceItemContract[];
}
