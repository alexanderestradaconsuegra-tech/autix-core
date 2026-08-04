/**
 * @autix/schemas
 *
 * El mecanismo para definir canonical schemas de Capabilities (RFC-001 §5,
 * §10) y validar un input contra ellos (RFC-000 §14). Todavía no define
 * ninguna Capability de negocio concreta — eso llega cuando exista el
 * primer Connector real.
 *
 * Re-exporta `z` (Zod) para que cualquier paquete que defina un schema lo
 * haga contra la misma instancia/versión de Zod que usa este paquete, en
 * vez de agregar su propia dependencia directa a `zod`.
 */

export { z } from 'zod';

export {
  type CanonicalSchemaMeta,
  canonicalSchemaRegistry,
  defineCanonicalSchema,
  toJsonSchema,
} from './registry.js';
export { type ValidationResult, validateAgainstSchema } from './validate.js';
export { compileJsonSchema, validateAgainstJsonSchema } from './validate-json-schema.js';
