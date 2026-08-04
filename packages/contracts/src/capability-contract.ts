import type { z } from 'zod';

import type { CapabilityId } from './ids.js';
import type { JsonSchemaDocument } from './json-schema-document.js';
import type { RiskLevel } from './risk-level.js';
import type { ToolExample } from './tool-example.js';

/**
 * Capability Contract (RFC-001 §5): un contrato de negocio agnóstico de
 * Connector, identificado por un nombre semántico estable. No ejecuta nada
 * por sí mismo — se resuelve (bindea) a un Tool Contract concreto de un
 * Connector concreto para un tenant concreto (RFC-001 §7, todavía no
 * implementado).
 *
 * `canonicalInputSchema`/`canonicalOutputSchema` son Zod schemas: el
 * mecanismo concreto para definirlos vive en `@autix/schemas`, pero
 * `@autix/contracts` solo necesita el tipo `z.ZodType` de la librería
 * `zod` — no depende de `@autix/schemas` (evita una dependencia circular,
 * ver README).
 */
export interface CapabilityContract<
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
> {
  readonly id: CapabilityId;
  readonly version: string;
  readonly canonicalInputSchema: Input;
  readonly canonicalOutputSchema: Output;
  readonly riskLevel: RiskLevel;
  readonly description: string;
  /**
   * RFC-001 §6.2: toda Capability que pueda participar de un Workflow
   * distribuido (saga) debe declarar si es compensable y, si lo es, con
   * qué otra Capability se deshace. `compensable: false` bloquea su uso
   * dentro de un Saga salvo como último paso.
   */
  readonly compensable: boolean;
  readonly compensatedBy?: CapabilityId;
  readonly examples?: readonly ToolExample[];
  /**
   * Sprint 14 (Capability Registry): si esta Capability se registró por
   * wire (`ConnectorManifestDocument`, `@autix/core`), su schema de negocio
   * real viaja acá como JSON Schema — `canonicalInputSchema`/
   * `canonicalOutputSchema` (Zod) quedan en un placeholder (`z.unknown()`)
   * porque el tipo genérico de este contrato sigue exigiendo un `z.ZodType`
   * real. `@autix/schemas`' `validateAgainstJsonSchema` (ajv) valida contra
   * estos campos cuando están presentes, en vez de los Zod. Ausentes para
   * toda Capability definida en proceso (como en los tests existentes) —
   * ningún sitio existente cambia.
   */
  readonly canonicalInputJsonSchema?: JsonSchemaDocument;
  readonly canonicalOutputJsonSchema?: JsonSchemaDocument;
}
