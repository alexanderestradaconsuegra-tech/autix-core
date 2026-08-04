import { describe, expect, it } from 'vitest';

import { compareSemver, isValidSemver } from './semver.js';

describe('isValidSemver', () => {
  it('accepts valid versions, with and without prerelease/build metadata', () => {
    expect(isValidSemver('1.0.0')).toBe(true);
    expect(isValidSemver('0.1.0')).toBe(true);
    expect(isValidSemver('1.0.0-alpha')).toBe(true);
    expect(isValidSemver('1.0.0-alpha.1')).toBe(true);
    expect(isValidSemver('1.0.0-0.3.7')).toBe(true);
    expect(isValidSemver('1.0.0+20130313144700')).toBe(true);
    expect(isValidSemver('1.0.0-beta+exp.sha.5114f85')).toBe(true);
  });

  it('rejects malformed versions', () => {
    expect(isValidSemver('1.0')).toBe(false);
    expect(isValidSemver('v1.0.0')).toBe(false);
    expect(isValidSemver('1.0.0.0')).toBe(false);
    expect(isValidSemver('01.0.0')).toBe(false);
    expect(isValidSemver('not-a-version')).toBe(false);
    expect(isValidSemver('')).toBe(false);
  });
});

describe('compareSemver', () => {
  it('orders major, minor and patch numerically', () => {
    expect(compareSemver('2.0.0', '10.0.0')).toBe(-1);
    expect(compareSemver('1.2.0', '1.10.0')).toBe(-1);
    expect(compareSemver('1.0.2', '1.0.10')).toBe(-1);
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
  });

  it('follows the canonical precedence example from semver.org §11', () => {
    const orderedAscending = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
    ];

    for (let i = 0; i < orderedAscending.length - 1; i += 1) {
      const lower = orderedAscending[i];
      const higher = orderedAscending[i + 1];
      if (lower === undefined || higher === undefined) continue;
      expect(compareSemver(lower, higher)).toBe(-1);
      expect(compareSemver(higher, lower)).toBe(1);
    }
  });

  it('ignores build metadata for precedence', () => {
    expect(compareSemver('1.0.0+build1', '1.0.0+build2')).toBe(0);
  });

  it('throws a VALIDATION_ERROR AutixError on an invalid version', () => {
    expect(() => compareSemver('not-a-version', '1.0.0')).toThrow(/no es una versión SemVer/);
  });
});
