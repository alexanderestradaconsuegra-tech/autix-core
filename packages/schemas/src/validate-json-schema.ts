import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';

import type { ValidationResult } from './validate.js';

/**
 * Sprint 14 (Capability Registry): un segundo camino de validación,
 * paralelo a `validateAgainstSchema` (Zod). Existe porque un Tool/Capability
 * registrado por wire (`ConnectorManifestDocument`, `@autix/core`) llega
 * como JSON Schema puro — nunca puede traer un `z.ZodType` real, porque el
 * Connector que lo publicó puede estar escrito en cualquier lenguaje, no
 * solo TypeScript. `validateAgainstSchema` (Zod) sigue intacto para Tools
 * registradas en proceso (tests, `apps/examples`) — ningún sitio existente
 * cambia.
 *
 * Se usa `Ajv2020` (no el `Ajv` por default, que es Draft-07) porque
 * `z.toJSONSchema()` (`registry.ts`) emite Draft 2020-12 por default — el
 * mismo draft en ambos extremos, sin negociar versiones de JSON Schema.
 */
const ajv = new Ajv2020({ allErrors: true, strict: false });

/**
 * Cachea el `ValidateFunction` compilado por instancia de schema (no por
 * contenido): el mismo objeto JSON Schema de un Tool no cambia entre
 * invocaciones, así que compilarlo una sola vez evita el costo de
 * recompilar en cada llamada — igual de barato que reusar un `z.ZodType` ya
 * parseado.
 */
const compiledValidators = new WeakMap<object, ValidateFunction>();

/**
 * Compila (o reusa del cache) el validador de un JSON Schema. Lanza si el
 * schema en sí es inválido — se llama a propósito en tiempo de registro
 * (`Registry.registerConnectorManifestDocument`), para rechazar un
 * Connector con un schema malformado antes de aceptar su manifiesto, no en
 * la primera invocación real.
 */
export function compileJsonSchema(schema: Record<string, unknown>): ValidateFunction {
  const cached = compiledValidators.get(schema);
  if (cached) {
    return cached;
  }
  const validateFn = ajv.compile(schema);
  compiledValidators.set(schema, validateFn);
  return validateFn;
}

export function validateAgainstJsonSchema<T = unknown>(
  schema: Record<string, unknown>,
  input: unknown,
): ValidationResult<T> {
  const validateFn = compileJsonSchema(schema);
  const valid = validateFn(input);

  if (valid) {
    return { success: true, data: input as T };
  }

  return {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'El input no cumple el schema esperado.',
      details: { issues: validateFn.errors ?? [] },
    },
  };
}
