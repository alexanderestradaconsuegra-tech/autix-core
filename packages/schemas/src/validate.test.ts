import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { validateAgainstSchema } from './validate.js';

const schema = z.object({ productRef: z.string(), quantity: z.number().int().positive() });

describe('validateAgainstSchema', () => {
  it('returns the parsed, typed data on success', () => {
    const result = validateAgainstSchema(schema, { productRef: 'queso', quantity: 3 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ productRef: 'queso', quantity: 3 });
    }
  });

  it('returns a VALIDATION_ERROR shape (RFC-000 §15) on failure, never throws', () => {
    const result = validateAgainstSchema(schema, { productRef: 'queso', quantity: -1 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.details).toBeDefined();
    }
  });

  it('rejects input missing required fields entirely', () => {
    const result = validateAgainstSchema(schema, {});

    expect(result.success).toBe(false);
  });
});
