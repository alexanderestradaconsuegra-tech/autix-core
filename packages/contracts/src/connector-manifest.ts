import type { ConnectorId } from './ids.js';
import type { ToolContract } from './tool-contract.js';

/**
 * El manifiesto que un Connector publica al registrarse (RFC-000 §13):
 * su identidad, versión, y la lista de Tools que implementa. Esta es solo
 * la FORMA del manifiesto — su validación, indexación y ciclo de vida
 * (`pending` → `active`) son responsabilidad del Registry (RFC-000 §13),
 * que todavía no existe en este sprint.
 */
export interface ConnectorManifest {
  readonly connectorId: ConnectorId;
  readonly version: string;
  readonly tools: readonly ToolContract[];
}
