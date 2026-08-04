import {
  toCapabilityId,
  toConnectorId,
  toToolId,
  type CapabilityContract,
  type CapabilityManifestEntry,
  type ConnectorId,
  type ToolContract,
  type ToolManifestEntry,
} from '@autix/contracts';
import { z } from 'zod';

/**
 * Convierte las entradas JSON-puras de un `ConnectorManifestDocument`
 * (Sprint 14) a los tipos internos que el `Registry` ya sabe almacenar
 * (`CapabilityContract`/`ToolContract`). `canonicalInputSchema`/
 * `inputSchema` (Zod) quedan en `z.unknown()` — un placeholder, nunca
 * usado para validar — porque el schema real de negocio viaja en
 * `canonicalInputJsonSchema`/`inputJsonSchema` (ver el docblock de esos
 * campos en `@autix/contracts`) y se valida con `ajv`, no con Zod.
 */
export function capabilityManifestEntryToContract(
  entry: CapabilityManifestEntry,
): CapabilityContract {
  return {
    id: toCapabilityId(entry.id),
    version: entry.version,
    description: entry.description,
    riskLevel: entry.riskLevel,
    compensable: entry.compensable,
    compensatedBy: entry.compensatedBy ? toCapabilityId(entry.compensatedBy) : undefined,
    canonicalInputSchema: z.unknown(),
    canonicalOutputSchema: z.unknown(),
    canonicalInputJsonSchema: entry.canonicalInputSchema,
    canonicalOutputJsonSchema: entry.canonicalOutputSchema,
  };
}

export function toolManifestEntryToContract(
  entry: ToolManifestEntry,
  connectorId: ConnectorId,
): ToolContract {
  return {
    id: toToolId(entry.id),
    connectorId: toConnectorId(entry.connectorId ?? connectorId),
    implementsCapability: toCapabilityId(entry.implementsCapability),
    implementsCapabilityVersion: entry.implementsCapabilityVersion,
    version: entry.version,
    inputSchema: z.unknown(),
    outputSchema: z.unknown(),
    inputJsonSchema: entry.inputSchema,
    outputJsonSchema: entry.outputSchema,
    riskLevel: entry.riskLevel,
    requiredScopes: entry.requiredScopes,
    idempotent: entry.idempotent,
    rateLimit: entry.rateLimit ?? undefined,
    description: entry.description,
    examples: entry.examples,
    compensable: entry.compensable,
    compensatedBy: entry.compensatedBy ? toToolId(entry.compensatedBy) : undefined,
  };
}
