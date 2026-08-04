import { describe, expect, it } from 'vitest';

import { renderStatusLine } from './index.js';

describe('@autix/cli (Sprint 1 placeholder)', () => {
  it('renders a status line built from its workspace dependencies', () => {
    expect(renderStatusLine()).toBe('@autix/core@0.0.0 · @autix/sdk@0.0.0');
  });
});
