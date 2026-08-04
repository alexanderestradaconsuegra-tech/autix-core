import { AutixError, RISK_LEVELS, type ConnectorManifestDocument } from '@autix/contracts';
import { z } from 'zod';

/**
 * Sprint 14 (Capability Registry): valida la FORMA del
 * `ConnectorManifestDocument` que llega por `POST /v1/connectors/register`
 * — no valida los schemas de negocio que contiene (eso es JSON Schema,
 * compilado con `ajv` en `@autix/schemas`), solo que el documento en sí
 * tenga la forma que el protocolo espera.
 *
 * Usar Zod acá no es un tercer mecanismo de validación nuevo: es el mismo
 * que ya usa todo el resto del Core para validar formas TypeScript — la
 * novedad de Sprint 14 es JSON Schema/ajv para los schemas de *negocio* que
 * el documento transporta, no para el documento mismo.
 */
const jsonSchemaDocumentSchema = z.record(z.string(), z.unknown());

const capabilityManifestEntrySchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  description: z.string(),
  riskLevel: z.enum(RISK_LEVELS),
  compensable: z.boolean(),
  compensatedBy: z.string().nullish(),
  canonicalInputSchema: jsonSchemaDocumentSchema,
  canonicalOutputSchema: jsonSchemaDocumentSchema,
});

const toolExampleSchema = z.object({
  description: z.string(),
  input: z.unknown(),
  output: z.unknown(),
});

const rateLimitPolicySchema = z.object({
  maxInvocations: z.number(),
  perSeconds: z.number(),
});

const toolManifestEntrySchema = z.object({
  id: z.string().min(1),
  connectorId: z.string().min(1),
  version: z.string().min(1),
  implementsCapability: z.string().min(1),
  implementsCapabilityVersion: z.string().min(1).optional(),
  description: z.string(),
  riskLevel: z.enum(RISK_LEVELS),
  requiredScopes: z.array(z.string()),
  idempotent: z.boolean(),
  compensable: z.boolean().optional(),
  compensatedBy: z.string().nullish(),
  rateLimit: rateLimitPolicySchema.nullish(),
  inputSchema: jsonSchemaDocumentSchema,
  outputSchema: jsonSchemaDocumentSchema,
  examples: z.array(toolExampleSchema).optional(),
});

const connectorManifestDocumentPublisherSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().optional(),
});

const connectorManifestDocumentEndpointSchema = z.object({
  baseUrl: z.string().min(1),
  healthPath: z.string().optional(),
  invokePath: z.string().optional(),
});

const connectorManifestDocumentConnectorSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  displayName: z.string().optional(),
  description: z.string().optional(),
  publisher: connectorManifestDocumentPublisherSchema.optional(),
  endpoint: connectorManifestDocumentEndpointSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const connectorManifestDocumentSchema = z.object({
  protocolVersion: z.string().min(1),
  connector: connectorManifestDocumentConnectorSchema,
  capabilities: z.array(capabilityManifestEntrySchema),
  tools: z.array(toolManifestEntrySchema),
});

/** Versiones del formato del manifiesto que este Registry sabe interpretar. */
export const SUPPORTED_MANIFEST_PROTOCOL_VERSIONS = ['1.0'] as const;

/**
 * Valida la forma de un `ConnectorManifestDocument` crudo (`unknown`, tal
 * como llega del body de `POST /v1/connectors/register`). La usa
 * `Registry.registerConnectorManifestDocument` internamente, y también
 * `@autix/core-server` — antes de registrar, la ruta necesita el
 * `connector.endpoint.baseUrl` ya validado para resolver el `ConnectorPort`
 * real (`HttpConnectorClient`), sin repetir un cast inseguro sobre el body.
 */
export function parseConnectorManifestDocument(document: unknown): ConnectorManifestDocument {
  const parsed = connectorManifestDocumentSchema.safeParse(document);
  if (!parsed.success) {
    throw new AutixError(
      'VALIDATION_ERROR',
      'El manifiesto no tiene la forma esperada de un ConnectorManifestDocument.',
      { issues: parsed.error.issues },
    );
  }
  return parsed.data;
}
