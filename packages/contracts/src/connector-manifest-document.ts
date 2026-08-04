import type { JsonSchemaDocument } from './json-schema-document.js';
import type { RateLimitPolicy } from './rate-limit.js';
import type { RiskLevel } from './risk-level.js';
import type { ToolExample } from './tool-example.js';

/**
 * `ConnectorManifestDocument` (Sprint 14, Capability Registry): la forma
 * exacta del manifiesto JSON que un Connector publica al registrarse por
 * red (`POST /v1/connectors/register`, `@autix/core-server`). A diferencia
 * de `ConnectorManifest` (que embebe `ToolContract`s con schemas Zod en
 * memoria, pensado para registro en proceso), este tipo es **JSON puro**:
 * ningún campo depende de una clase o tipo de TypeScript — cualquier
 * lenguaje (Python, Go, Rust, Java) puede producir/consumir este documento
 * con solo un serializador JSON.
 *
 * Principios de diseño (acordados con el usuario antes de implementar):
 * - Los Connectors son proveedores de Capabilities, no la unidad central
 *   del sistema — `capabilities[]` y `tools[]` son catálogos separados;
 *   `tools[]` referencia una Capability por id, nunca al revés.
 * - `protocolVersion` versiona el FORMATO de este documento, independiente
 *   de `connector.version` (la versión del release de ese Connector) —
 *   permite evolucionar el protocolo del Registry sin romper Connectors
 *   viejos.
 * - Todo schema de negocio (`canonicalInputSchema`/`canonicalOutputSchema`
 *   de una Capability, `inputSchema`/`outputSchema` de una Tool) es JSON
 *   Schema (Draft 2020-12), el mismo formato que `@autix/schemas` ya emite
 *   con `toJsonSchema()` (Sprint 2) — ningún Connector necesita conocer
 *   Zod, solo JSON Schema estándar.
 *
 * Los Workflows NO se publican por este documento: no pertenecen a un solo
 * Connector (RFC-001 §4, cross-Connector por diseño) y siguen
 * registrándose directamente contra el Registry
 * (`Registry.registerWorkflow`).
 */
export interface ConnectorManifestDocument {
  readonly protocolVersion: string;
  readonly connector: ConnectorManifestDocumentConnector;
  readonly capabilities: readonly CapabilityManifestEntry[];
  readonly tools: readonly ToolManifestEntry[];
}

export interface ConnectorManifestDocumentConnector {
  readonly id: string;
  readonly version: string;
  readonly displayName?: string;
  readonly description?: string;
  /** Marketplace-ready desde v1 — sin firma/verificación todavía (fuera de alcance de Sprint 14). */
  readonly publisher?: ConnectorManifestDocumentPublisher;
  /** Dónde el Core alcanza a este Connector por HTTP — completa el registro en el `ConnectorDirectory`, no solo en el `Registry`. */
  readonly endpoint: ConnectorManifestDocumentEndpoint;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ConnectorManifestDocumentPublisher {
  readonly id: string;
  readonly name: string;
  readonly url?: string;
}

export interface ConnectorManifestDocumentEndpoint {
  readonly baseUrl: string;
  readonly healthPath?: string;
  readonly invokePath?: string;
}

/**
 * Una Capability publicada por wire. `id`/`version` son globales (no por
 * Connector): si dos Connectors distintos implementan la misma Capability,
 * el segundo NO vuelve a declarar este bloque — solo la referencia desde
 * `ToolManifestEntry.implementsCapability`/`implementsCapabilityVersion`.
 */
export interface CapabilityManifestEntry {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly riskLevel: RiskLevel;
  readonly compensable: boolean;
  readonly compensatedBy?: string | null;
  readonly canonicalInputSchema: JsonSchemaDocument;
  readonly canonicalOutputSchema: JsonSchemaDocument;
}

/** La implementación, de este Connector, de una Capability ya declarada (en este mismo documento o previamente en el Registry). */
export interface ToolManifestEntry {
  readonly id: string;
  readonly connectorId: string;
  readonly version: string;
  readonly implementsCapability: string;
  /** Ausente = la última versión registrada de esa Capability (mismo default que `Registry.getTool()` sin `version`). */
  readonly implementsCapabilityVersion?: string;
  readonly description: string;
  readonly riskLevel: RiskLevel;
  readonly requiredScopes: readonly string[];
  readonly idempotent: boolean;
  readonly compensable?: boolean;
  readonly compensatedBy?: string | null;
  readonly rateLimit?: RateLimitPolicy | null;
  readonly inputSchema: JsonSchemaDocument;
  readonly outputSchema: JsonSchemaDocument;
  readonly examples?: readonly ToolExample[];
}
