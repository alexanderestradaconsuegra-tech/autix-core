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

import type { RegistryStore } from './registry-store.js';

/**
 * Implementación in-memory del `RegistryStore` (Sprint 3; Workflows desde
 * Sprint 13; Capabilities desde Sprint 14). Suficiente para un solo
 * proceso — se pierde al reiniciar. El reemplazo por un store persistente
 * (Postgres/Supabase, RFC-000 §4) es un cambio contenido a esta clase,
 * porque `Registry` solo depende de la interfaz.
 */
export class InMemoryRegistryStore implements RegistryStore {
  private readonly connectors = new Map<ConnectorId, ConnectorManifest>();
  private readonly toolVersions = new Map<ToolId, ToolContract[]>();
  private readonly workflowVersions = new Map<WorkflowId, WorkflowContract[]>();
  private readonly capabilityVersions = new Map<CapabilityId, CapabilityContract[]>();
  private readonly agents = new Map<AgentId, AgentContract>();
  private readonly marketplaceItems = new Map<ConnectorId, MarketplaceItemContract>();

  saveConnector(manifest: ConnectorManifest): void {
    this.connectors.set(manifest.connectorId, manifest);
  }

  getConnector(connectorId: ConnectorId): ConnectorManifest | undefined {
    return this.connectors.get(connectorId);
  }

  listConnectors(): readonly ConnectorManifest[] {
    return Array.from(this.connectors.values());
  }

  saveTool(tool: ToolContract): void {
    const existing = this.toolVersions.get(tool.id);
    if (existing) {
      existing.push(tool);
    } else {
      this.toolVersions.set(tool.id, [tool]);
    }
  }

  listToolVersions(toolId: ToolId): readonly ToolContract[] {
    return this.toolVersions.get(toolId) ?? [];
  }

  listAllTools(): readonly ToolContract[] {
    return Array.from(this.toolVersions.values()).flat();
  }

  saveWorkflow(workflow: WorkflowContract): void {
    const existing = this.workflowVersions.get(workflow.id);
    if (existing) {
      existing.push(workflow);
    } else {
      this.workflowVersions.set(workflow.id, [workflow]);
    }
  }

  listWorkflowVersions(workflowId: WorkflowId): readonly WorkflowContract[] {
    return this.workflowVersions.get(workflowId) ?? [];
  }

  listAllWorkflows(): readonly WorkflowContract[] {
    return Array.from(this.workflowVersions.values()).flat();
  }

  saveCapability(capability: CapabilityContract): void {
    const existing = this.capabilityVersions.get(capability.id);
    if (existing) {
      existing.push(capability);
    } else {
      this.capabilityVersions.set(capability.id, [capability]);
    }
  }

  listCapabilityVersions(capabilityId: CapabilityId): readonly CapabilityContract[] {
    return this.capabilityVersions.get(capabilityId) ?? [];
  }

  listAllCapabilities(): readonly CapabilityContract[] {
    return Array.from(this.capabilityVersions.values()).flat();
  }

  saveAgent(agent: AgentContract): void {
    this.agents.set(agent.id, agent);
  }

  getAgent(agentId: AgentId): AgentContract | undefined {
    return this.agents.get(agentId);
  }

  listAllAgents(): readonly AgentContract[] {
    return Array.from(this.agents.values());
  }

  saveMarketplaceItem(item: MarketplaceItemContract): void {
    this.marketplaceItems.set(item.id, item);
  }

  getMarketplaceItem(connectorId: ConnectorId): MarketplaceItemContract | undefined {
    return this.marketplaceItems.get(connectorId);
  }

  listAllMarketplaceItems(): readonly MarketplaceItemContract[] {
    return Array.from(this.marketplaceItems.values());
  }
}
