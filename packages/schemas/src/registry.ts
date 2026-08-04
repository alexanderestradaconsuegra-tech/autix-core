import { z } from 'zod';

/**
 * Metadata que identifica un canonical schema (RFC-001 §5, §10): el `id`
 * es el nombre estable que referencia una Capability (ej. "create_order"),
 * separado de `title`/`description`, que son para humanos y agentes.
 */
export interface CanonicalSchemaMeta {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
}

/**
 * Registro de Zod (nativo desde v4) que asocia cada canonical schema con su
 * `CanonicalSchemaMeta`. Es lo que permite generar JSON Schema con
 * `$id`/`title` correctos (`toJsonSchema`, más abajo) en vez de un blob
 * anónimo — necesario para el OpenAPI automático de RFC-000 §6 y, a
 * futuro, para los tool schemas de MCP.
 */
export const canonicalSchemaRegistry = z.registry<CanonicalSchemaMeta>();

/**
 * Declara un canonical schema (RFC-001 §5): registra su metadata y
 * devuelve el mismo schema, sin envolverlo — sigue siendo un ZodType
 * normal, usable directamente en un `CapabilityContract`.
 */
export function defineCanonicalSchema<Schema extends z.ZodType>(
  meta: CanonicalSchemaMeta,
  schema: Schema,
): Schema {
  canonicalSchemaRegistry.add(schema, meta);
  return schema;
}

/**
 * Convierte un schema (idealmente ya declarado con `defineCanonicalSchema`)
 * a JSON Schema (Draft 2020-12), incluyendo la metadata del registro
 * cuando esté disponible.
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { metadata: canonicalSchemaRegistry });
}
