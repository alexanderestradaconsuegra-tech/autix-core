import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildServer } from '../server.js';
import { createDefaultDependencies } from '../container.js';

describe('Auth Middleware', () => {
  beforeEach(() => {
    // Reset environment for each test
    delete process.env.OAUTH_ISSUER;
    delete process.env.OAUTH_JWKS_URI;
    delete process.env.OAUTH_AUDIENCE;
    delete process.env.DISABLE_AUTH;
  });

  it('should allow unauthenticated access to /health', async () => {
    const deps = createDefaultDependencies();
    const app = await buildServer(deps, { skipAuth: true });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
  });

  it('should block requests without auth header when auth is enabled', async () => {
    process.env.OAUTH_ISSUER = 'https://example.com/';
    process.env.OAUTH_JWKS_URI = 'https://example.com/.well-known/jwks.json';
    process.env.OAUTH_AUDIENCE = 'test-audience';

    const deps = createDefaultDependencies();
    const app = await buildServer(deps, { skipAuth: false, logger: false });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/agents',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: expect.stringContaining('Missing or invalid authorization header'),
    });
  });

  it('should allow requests with DISABLE_AUTH=true', async () => {
    process.env.DISABLE_AUTH = 'true';
    process.env.OAUTH_ISSUER = 'https://example.com/';
    process.env.OAUTH_JWKS_URI = 'https://example.com/.well-known/jwks.json';
    process.env.OAUTH_AUDIENCE = 'test-audience';

    const deps = createDefaultDependencies();
    const app = await buildServer(deps, { skipAuth: false, logger: false });

    // Mock a JWT token (base64 encoded payload)
    const mockToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJ0ZW5hbnRfaWQiOiJ0ZXN0LXRlbmFudCJ9.signature';

    const response = await app.inject({
      method: 'GET',
      url: '/v1/agents',
      headers: {
        Authorization: `Bearer ${mockToken}`,
      },
    });

    // Should not return 401 (might return 200 or other status, but not 401 due to auth)
    expect(response.statusCode).not.toBe(401);
  });

  it('should skip auth for health check endpoint', async () => {
    process.env.OAUTH_ISSUER = 'https://example.com/';
    process.env.OAUTH_JWKS_URI = 'https://example.com/.well-known/jwks.json';
    process.env.OAUTH_AUDIENCE = 'test-audience';

    const deps = createDefaultDependencies();
    const app = await buildServer(deps, { skipAuth: false, logger: false });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
  });
});
