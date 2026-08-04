import { describe, expect, it } from 'vitest';

import {
  CORE_PACKAGE_NAME,
  CORE_PACKAGE_VERSION,
  SDK_PACKAGE_NAME,
  SDK_PACKAGE_VERSION,
} from './index.js';

describe('@autix/sdk (Sprint 1 placeholder)', () => {
  it('exposes its own package identity', () => {
    expect(SDK_PACKAGE_NAME).toBe('@autix/sdk');
    expect(SDK_PACKAGE_VERSION).toBe('0.0.0');
  });

  it('resolves its workspace dependency (@autix/core) transitively', () => {
    expect(CORE_PACKAGE_NAME).toBe('@autix/core');
    expect(CORE_PACKAGE_VERSION).toBe('0.0.0');
  });
});
