import { ERROR_CODES } from '@autix/contracts';
import { describe, expect, it } from 'vitest';

import { errorCodeToHttpStatus } from './http-error-mapping.js';

describe('errorCodeToHttpStatus', () => {
  it('maps every ErrorCode to a valid HTTP status', () => {
    for (const code of ERROR_CODES) {
      const status = errorCodeToHttpStatus(code);
      expect(status).toBeGreaterThanOrEqual(200);
      expect(status).toBeLessThan(600);
    }
  });

  it('maps specific codes as expected', () => {
    expect(errorCodeToHttpStatus('VALIDATION_ERROR')).toBe(400);
    expect(errorCodeToHttpStatus('UNAUTHORIZED')).toBe(401);
    expect(errorCodeToHttpStatus('FORBIDDEN')).toBe(403);
    expect(errorCodeToHttpStatus('APPROVAL_REQUIRED')).toBe(202);
    expect(errorCodeToHttpStatus('NOT_FOUND')).toBe(404);
    expect(errorCodeToHttpStatus('CONFLICT')).toBe(409);
    expect(errorCodeToHttpStatus('RATE_LIMITED')).toBe(429);
    expect(errorCodeToHttpStatus('CONNECTOR_UNAVAILABLE')).toBe(503);
    expect(errorCodeToHttpStatus('CONNECTOR_ERROR')).toBe(502);
    expect(errorCodeToHttpStatus('INTERNAL_ERROR')).toBe(500);
    expect(errorCodeToHttpStatus('TIMEOUT')).toBe(504);
  });
});
