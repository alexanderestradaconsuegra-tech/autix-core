import type { CapabilityId, ConnectorId } from './ids.js';

/**
 * Marketplace Item Contract (RC2 Fase 3): representa un item instalable
 * en el Marketplace — típicamente un Connector con metadata de qué
 * Capabilities proporciona.
 *
 * Un MarketplaceItem es el "catálogo" de una Integración: qué es, quién
 * la proporciona, qué capabilities expone. El Core lista items disponibles
 * para que Studio ofrezca una UI de instalación; la instalación real
 * (registro del Connector) es un paso separado.
 */
export interface MarketplaceItemContract {
  readonly id: ConnectorId;
  readonly version: string;
  readonly name: string;
  readonly category: string;
  readonly description: string;
  /**
   * Descripción larga para la página de detalle del item.
   */
  readonly longDescription?: string;
  /**
   * Capabilities que este item proporciona si se instala.
   * Los IDs resuelven contra el Registry de Capabilities en tiempo
   * de ejecución.
   */
  readonly capabilitiesProvided: readonly CapabilityId[];
}
