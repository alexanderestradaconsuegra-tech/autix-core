import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { toJsonSchema } from './registry.js';
import { compileJsonSchema, validateAgainstJsonSchema } from './validate-json-schema.js';

const schema = {
  type: 'object',
  properties: {
    productRef: { type: 'string' },
    quantity: { type: 'integer', minimum: 1 },
  },
  required: ['productRef', 'quantity'],
  additionalProperties: false,
};

describe('validateAgainstJsonSchema', () => {
  it('returns the input as-is on success (no coercion, unlike Zod)', () => {
    const result = validateAgainstJsonSchema(schema, { productRef: 'queso', quantity: 3 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ productRef: 'queso', quantity: 3 });
    }
  });

  it('returns a VALIDATION_ERROR shape (RFC-000 §15) on failure, never throws', () => {
    const result = validateAgainstJsonSchema(schema, { productRef: 'queso', quantity: -1 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.details?.issues).toBeDefined();
    }
  });

  it('rejects input missing required fields entirely', () => {
    const result = validateAgainstJsonSchema(schema, {});

    expect(result.success).toBe(false);
  });

  it('validates against JSON Schema produced by toJsonSchema() (same draft, Zod -> wire round trip)', () => {
    const zodSchema = z.object({ nombre: z.string() });
    const jsonSchema = toJsonSchema(zodSchema);

    expect(validateAgainstJsonSchema(jsonSchema, { nombre: 'queso' }).success).toBe(true);
    expect(validateAgainstJsonSchema(jsonSchema, { nombre: 123 }).success).toBe(false);
  });

  it('throws when the schema itself is malformed — used at registration time to fail fast', () => {
    expect(() => compileJsonSchema({ type: 'not-a-real-type' })).toThrow();
  });

  it('reuses the compiled validator for the same schema instance (cache hit)', () => {
    const first = compileJsonSchema(schema);
    const second = compileJsonSchema(schema);

    expect(first).toBe(second);
  });
});
