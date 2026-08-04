import type { z } from 'zod';

import type { CapabilityId, ConnectorId, ToolId } from './ids.js';
import type { JsonSchemaDocument } from './json-schema-document.js';
import type { RateLimitPolicy } from './rate-limit.js';
import type { RiskLevel } from './risk-level.js';
import type { ToolExample } from './tool-example.js';

/**
 * Tool Contract (RFC-000 §8, RFC-001 §4): la implementación, para UN
 * Connector específico, de una Capability. `inputSchema`/`outputSchema`
 * son el schema NATIVO de ese Connector — no el canonical schema de la
 * Capability que implementa (esa traducción es responsabilidad del
 * binding/adapter, RFC-001 §7 y §10, todavía no implementado).
 */
export interface ToolContract<
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
> {
  readonly id: ToolId;
  readonly connectorId: ConnectorId;
  /** La Capability agnóstica de Connector que esta Tool implementa. */
  readonly implementsCapability: CapabilityId;
  readonly version: string;
  readonly inputSchema: Input;
  readonly outputSchema: Output;
  readonly riskLevel: RiskLevel;
  readonly requiredScopes: readonly string[];
  readonly idempotent: boolean;
  readonly rateLimit?: RateLimitPolicy;
  readonly description: string;
  readonly examples?: readonly ToolExample[];
  /** RFC-000 §21: versión que reemplaza a esta, durante su deprecación. */
  readonly deprecatedBy?: ToolId;
  /**
   * RFC-001 §6.2 / Sprint 13: si esta Tool concreta puede compensarse
   * (deshacerse) dentro de un Workflow (patrón saga) y, si puede, qué otra
   * Tool del mismo Connector la deshace. Ya existía en `CapabilityContract`
   * (a nivel de negocio, agnóstico de Connector); acá se repite a nivel de
   * Tool porque el `WorkflowEngine` orquesta `toolId`/`connectorId`
   * concretos, no Capabilities sin bindear (esa traducción sigue sin
   * implementarse, RFC-001 §7). Opcional — a diferencia de
   * `CapabilityContract.compensable` (`boolean` obligatorio): agregarlo acá
   * como obligatorio hubiera roto todos los `ToolContract` ya construidos
   * en sprints anteriores por nada. Ausente equivale a `false`.
   */
  readonly compensable?: boolean;
  readonly compensatedBy?: ToolId;
  /**
   * Sprint 14 (Capability Registry): versión exacta de la Capability que
   * esta Tool implementa (`implementsCapability`). Ausente equivale a "la
   * última versión registrada de esa Capability" — mismo default que
   * `Registry.getTool()`/`getWorkflow()` ya usan sin `version`. Solo tiene
   * sentido una vez que las Capabilities se versionan de verdad en el
   * Registry (antes de Sprint 14 no se indexaban en absoluto).
   */
  readonly implementsCapabilityVersion?: string;
  /**
   * Sprint 14: si esta Tool se registró por wire
   * (`ConnectorManifestDocument`), su schema de negocio real viaja acá como
   * JSON Schema — `inputSchema`/`outputSchema` (Zod) quedan en un
   * placeholder (`z.unknown()`) por la misma razón que en
   * `CapabilityContract`. El `ExecutionEngine` valida contra estos campos
   * (vía `validateAgainstJsonSchema`, ajv) cuando están presentes, en vez de
   * `inputSchema`/`outputSchema` (Zod). Ausentes para toda Tool registrada
   * en proceso — ningún Connector existente (campolac-connector, tests)
   * cambia de comportamiento.
   */
  readonly inputJsonSchema?: JsonSchemaDocument;
  readonly outputJsonSchema?: JsonSchemaDocument;
}
