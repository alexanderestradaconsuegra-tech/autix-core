import { AutixError } from './errors.js';

/**
 * Parsing y comparación de SemVer 2.0.0 (RFC-000 §21: el Registry necesita
 * ordenar versiones de una Tool para resolver "la última" y decidir si un
 * registro nuevo es un patch/minor/major).
 *
 * Se implementa a mano en vez de agregar la dependencia `semver` de npm:
 * ese paquete es CommonJS puro sin tipos propios (necesitaría además
 * `@types/semver`) para resolver un problema mucho más amplio (rangos de
 * versión, `^`, `~`) del que no necesitamos nada — solo "¿es válido?" y
 * "¿cuál es mayor?". La expresión regular es la oficial de
 * semver.org/spec/v2.0.0.html#backusnaur-form-grammar-for-valid-semantic-versions,
 * y la comparación de prerelease sigue la regla de precedencia §11 letra
 * por letra (validado contra el ejemplo canónico del spec, ver
 * semver.test.ts).
 */
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

interface ParsedSemver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly string[];
}

function parseSemver(value: string): ParsedSemver | undefined {
  const match = SEMVER_PATTERN.exec(value);
  if (!match) {
    return undefined;
  }

  const [, major, minor, patch, prerelease] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease === undefined || prerelease === '' ? [] : prerelease.split('.'),
  };
}

export function isValidSemver(value: string): boolean {
  return parseSemver(value) !== undefined;
}

function requireParsed(value: string): ParsedSemver {
  const parsed = parseSemver(value);
  if (!parsed) {
    throw new AutixError('VALIDATION_ERROR', `"${value}" no es una versión SemVer válida.`, {
      value,
    });
  }
  return parsed;
}

function compareIdentifier(a: string, b: string): -1 | 0 | 1 {
  const numericA = /^\d+$/.test(a);
  const numericB = /^\d+$/.test(b);

  if (numericA && numericB) {
    const diff = Number(a) - Number(b);
    return diff < 0 ? -1 : diff > 0 ? 1 : 0;
  }
  // Un identificador numérico siempre tiene menor precedencia que uno alfanumérico.
  if (numericA !== numericB) {
    return numericA ? -1 : 1;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

function comparePrerelease(a: readonly string[], b: readonly string[]): -1 | 0 | 1 {
  // Una versión sin prerelease tiene mayor precedencia que una con prerelease.
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const partA = a[i];
    const partB = b[i];
    // El conjunto de campos con menos identificadores tiene menor precedencia,
    // siempre que todos los anteriores fueran iguales.
    if (partA === undefined) return -1;
    if (partB === undefined) return 1;

    const comparison = compareIdentifier(partA, partB);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

/** -1 si a < b, 0 si son iguales en precedencia, 1 si a > b. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const parsedA = requireParsed(a);
  const parsedB = requireParsed(b);

  if (parsedA.major !== parsedB.major) return parsedA.major < parsedB.major ? -1 : 1;
  if (parsedA.minor !== parsedB.minor) return parsedA.minor < parsedB.minor ? -1 : 1;
  if (parsedA.patch !== parsedB.patch) return parsedA.patch < parsedB.patch ? -1 : 1;

  return comparePrerelease(parsedA.prerelease, parsedB.prerelease);
}
