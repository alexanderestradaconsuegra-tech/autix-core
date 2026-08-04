import { describe, expect, it } from 'vitest';

import { defineCanonicalSchema, validateAgainstSchema, z } from './index.js';

describe('@autix/schemas barrel', () => {
  it('composes defineCanonicalSchema (this package) with validateAgainstSchema end to end', () => {
    const schema = defineCanonicalSchema(
      { id: 'create_order.input', title: 'CreateOrderInput' },
      z.object({ customerRef: z.string(), items: z.array(z.object({ productRef: z.string() })) }),
    );

    const result = validateAgainstSchema(schema, { customerRef: 'c-1', items: [] });

    expect(result.success).toBe(true);
  });
});
