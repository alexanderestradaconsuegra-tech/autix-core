import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';
import { createDefaultDependencies } from '../container.js';

describe('Workflow Management Routes', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    process.env.DISABLE_AUTH = 'true';
    process.env.OAUTH_ISSUER = 'https://example.com/';
    process.env.OAUTH_JWKS_URI = 'https://example.com/.well-known/jwks.json';
    process.env.OAUTH_AUDIENCE = 'test-audience';

    const deps = createDefaultDependencies();
    app = await buildServer(deps, { skipAuth: false, logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create a workflow (POST /v1/workflows)', async () => {
    const mockToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJ0ZW5hbnRfaWQiOiJ0ZXN0LXRlbmFudCJ9.signature';

    const response = await app.inject({
      method: 'POST',
      url: '/v1/workflows',
      headers: { Authorization: `Bearer ${mockToken}` },
      payload: {
        name: 'Test Workflow',
        description: 'A test workflow',
        version: '1.0.0',
        steps: [],
      },
    });

    expect(response.statusCode).toBe(201);
    const data = response.json();
    expect(data.name).toBe('Test Workflow');
    expect(data.version).toBe('1.0.0');
  });

  it('should reject workflow creation without name', async () => {
    const mockToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJ0ZW5hbnRfaWQiOiJ0ZXN0LXRlbmFudCJ9.signature';

    const response = await app.inject({
      method: 'POST',
      url: '/v1/workflows',
      headers: { Authorization: `Bearer ${mockToken}` },
      payload: {
        description: 'Missing name',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should list workflows (GET /v1/workflows)', async () => {
    const mockToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJ0ZW5hbnRfaWQiOiJ0ZXN0LXRlbmFudCJ9.signature';

    const response = await app.inject({
      method: 'GET',
      url: '/v1/workflows',
      headers: { Authorization: `Bearer ${mockToken}` },
    });

    expect(response.statusCode).toBe(200);
    const data = response.json();
    expect(data).toHaveProperty('workflows');
    expect(Array.isArray(data.workflows)).toBe(true);
  });
});
