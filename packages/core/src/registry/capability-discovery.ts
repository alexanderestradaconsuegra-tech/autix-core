import type { CapabilityContract, ConnectorId, ToolId } from '@autix/contracts';

/**
 * Sprint 14 (Capability Registry): a qué Tool concreta, de qué Connector,
 * se resuelve una Capability. Un Agente descubre por `capabilityId` — el
 * `connectorId` es un detalle de la implementación elegida, no algo que el
 * Agente necesite saber de antemano.
 */
export interface CapabilityImplementationRef {
  readonly connectorId: ConnectorId;
  readonly toolId: ToolId;
  readonly toolVersion: string;
}

export interface CapabilityDiscoveryEntry {
  readonly capability: CapabilityContract;
  readonly implementations: readonly CapabilityImplementationRef[];
}
