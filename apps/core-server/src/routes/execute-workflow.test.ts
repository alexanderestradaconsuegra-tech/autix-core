import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';
import { createDefaultDependencies } from '../container.js';

describe('Workflow Execution Routes', () => {
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

  it('should execute a workflow (POST /v1/workflows/:id/execute)', async () => {
    const mockToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJ0ZW5hbnRfaWQiOiJ0ZXN0LXRlbmFudCJ9.signature';

    // First create a workflow
    const createResp = await app.inject({
      method: 'POST',
      url: '/v1/workflows',
      headers: { Authorization: `Bearer ${mockToken}` },
      payload: {
        name: 'Test Workflow for Execution',
        steps: [],
      },
    });

    expect(createResp.statusCode).toBe(201);
    const workflow = createResp.json();

    // Now execute it
    const executeResp = await app.inject({
      method: 'POST',
      url: `/v1/workflows/${workflow.id}/execute`,
      headers: { Authorization: `Bearer ${mockToken}` },
      payload: { testInput: 'test' },
    });

    expect(executeResp.statusCode).toBe(201);
    const execution = executeResp.json();
    expect(execution.workflowId).toBe(workflow.id);
    expect(execution.status).toBe('success');
  });

  it('should list workflow executions (GET /v1/workflows/:id/executions)', async () => {
    const mockToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJ0ZW5hbnRfaWQiOiJ0ZXN0LXRlbmFudCJ9.signature';

    // Create workflow
    const createResp = await app.inject({
      method: 'POST',
      url: '/v1/workflows',
      headers: { Authorization: `Bearer ${mockToken}` },
      payload: {
        name: 'Workflow for Execution History',
        steps: [],
      },
    });

    const workflow = createResp.json();

    // Execute it
    await app.inject({
      method: 'POST',
      url: `/v1/workflows/${workflow.id}/execute`,
      headers: { Authorization: `Bearer ${mockToken}` },
    });

    // List executions
    const listResp = await app.inject({
      method: 'GET',
      url: `/v1/workflows/${workflow.id}/executions`,
      headers: { Authorization: `Bearer ${mockToken}` },
    });

    expect(listResp.statusCode).toBe(200);
    const data = listResp.json();
    expect(data).toHaveProperty('executions');
    expect(Array.isArray(data.executions)).toBe(true);
    expect(data.count).toBeGreaterThan(0);
  });

  it('should return 404 for non-existent workflow execution', async () => {
    const mockToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJ0ZW5hbnRfaWQiOiJ0ZXN0LXRlbmFudCJ9.signature';

    const response = await app.inject({
      method: 'POST',
      url: '/v1/workflows/nonexistent-id/execute',
      headers: { Authorization: `Bearer ${mockToken}` },
    });

    expect(response.statusCode).toBe(404);
  });
});
