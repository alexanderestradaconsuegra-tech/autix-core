import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { canonicalSchemaRegistry, defineCanonicalSchema, toJsonSchema } from './registry.js';

describe('defineCanonicalSchema / toJsonSchema', () => {
  it('registers the schema metadata and returns the schema unchanged', () => {
    const schema = defineCanonicalSchema(
      { id: 'check_price_and_stock.input', title: 'CheckPriceAndStockInput' },
      z.object({ productRef: z.string() }),
    );

    expect(canonicalSchemaRegistry.get(schema)).toEqual({
      id: 'check_price_and_stock.input',
      title: 'CheckPriceAndStockInput',
    });
    expect(schema.parse({ productRef: 'queso-mantecoso' })).toEqual({
      productRef: 'queso-mantecoso',
    });
  });

  it('produces JSON Schema (Draft 2020-12) carrying the registered title', () => {
    const schema = defineCanonicalSchema(
      { id: 'check_price_and_stock.output', title: 'CheckPriceAndStockOutput' },
      z.object({ price: z.number(), stockQty: z.number().int() }),
    );

    const jsonSchema = toJsonSchema(schema);

    expect(jsonSchema['title']).toBe('CheckPriceAndStockOutput');
    expect(jsonSchema['type']).toBe('object');
    expect(jsonSchema['required']).toEqual(['price', 'stockQty']);
  });

  it('still produces valid JSON Schema for a schema with no registered metadata', () => {
    const jsonSchema = toJsonSchema(z.object({ ok: z.boolean() }));

    expect(jsonSchema['type']).toBe('object');
    expect(jsonSchema['title']).toBeUndefined();
  });
});
