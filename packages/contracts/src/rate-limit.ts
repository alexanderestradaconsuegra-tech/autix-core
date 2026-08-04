/**
 * Política de rate limit de una Tool (RFC-000 §8).
 */
export interface RateLimitPolicy {
  readonly maxInvocations: number;
  readonly perSeconds: number;
}
