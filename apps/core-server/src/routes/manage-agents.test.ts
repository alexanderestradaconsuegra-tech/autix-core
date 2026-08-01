import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';
import { createDefaultDependencies } from '../container.js';

describe('Agent Management Routes', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    // Set up test environment to skip auth
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

  it('should create an agent (POST /v1/agents)', async () => {
    const mockToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJ0ZW5hbnRfaWQiOiJ0ZXN0LXRlbmFudCJ9.signature';

    const response = await app.inject({
      method: 'POST',
      url: '/v1/agents',
      headers: { Authorization: `Bearer ${mockToken}` },
      payload: {
        name: 'Test Agent',
        description: 'A test agent',
        model: 'gpt-4',
        version: '1.0.0',
        capabilities: ['capability1'],
      },
    });

    expect(response.statusCode).toBe(201);
    const data = response.json();
    expect(data.name).toBe('Test Agent');
    expect(data.model).toBe('gpt-4');
  });

  it('should reject agent creation without required fields', async () => {
    const mockToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJ0ZW5hbnRfaWQiOiJ0ZXN0LXRlbmFudCJ9.signature';

    const response = await app.inject({
      method: 'POST',
      url: '/v1/agents',
      headers: { Authorization: `Bearer ${mockToken}` },
      payload: {
        description: 'Missing name and model',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should list agents (GET /v1/agents)', async () => {
    const mockToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJ0ZW5hbnRfaWQiOiJ0ZXN0LXRlbmFudCJ9.signature';

    const response = await app.inject({
      method: 'GET',
      url: '/v1/agents',
      headers: { Authorization: `Bearer ${mockToken}` },
    });

    expect(response.statusCode).toBe(200);
    const data = response.json();
    expect(data).toHaveProperty('agents');
    expect(Array.isArray(data.agents)).toBe(true);
  });
});
