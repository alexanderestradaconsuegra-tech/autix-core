import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';

import { JwksTokenVerifier } from './jwks-token-verifier.js';

const ISSUER = 'https://issuer.test/';
const AUDIENCE = 'autix-core';
const KID = 'test-key-1';

let server: Server | undefined;

async function startJwksServer(jwk: Record<string, unknown>): Promise<string> {
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('No se pudo obtener el puerto del servidor de prueba.');
  }
  return `http://127.0.0.1:${address.port}/jwks.json`;
}

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  }
});

interface BuildTokenOptions {
  readonly claims?: JWTPayload;
  readonly subject?: string;
  readonly issuer?: string;
  readonly audience?: string;
  readonly expiresIn?: string;
}

async function buildSignedToken(
  options: BuildTokenOptions = {},
): Promise<{ token: string; jwksUri: string }> {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const jwksUri = await startJwksServer({ ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' });

  const token = await new SignJWT({
    tenant_id: 'campolac',
    scope: 'products:read products:write',
    roles: ['admin'],
    permissions: ['orders:create'],
    ...options.claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setSubject(options.subject ?? 'agent-1')
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '5m')
    .sign(privateKey);

  return { token, jwksUri };
}

describe('JwksTokenVerifier', () => {
  it('resolves a Principal from a valid JWT (sub/tenant_id/scope/roles/permissions)', async () => {
    const { token, jwksUri } = await buildSignedToken();
    const verifier = new JwksTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwksUri });

    const principal = await verifier.verify(token);

    expect(principal.principalId).toBe('agent-1');
    expect(principal.tenantId).toBe('campolac');
    expect(principal.grantedScopes).toEqual(['products:read', 'products:write']);
    expect(principal.roles).toEqual(['admin']);
    expect(principal.permissions).toEqual(['orders:create']);
    expect(principal.claims).toMatchObject({ tenant_id: 'campolac', sub: 'agent-1' });
  });

  it('supports grantedScopes/roles as arrays instead of a space-delimited string', async () => {
    const { token, jwksUri } = await buildSignedToken({
      claims: { tenant_id: 'campolac', scope: ['products:read', 'products:write'] },
    });
    const verifier = new JwksTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwksUri });

    const principal = await verifier.verify(token);

    expect(principal.grantedScopes).toEqual(['products:read', 'products:write']);
  });

  it('supports a custom claim mapping for IdPs that use different claim names', async () => {
    const { token, jwksUri } = await buildSignedToken({
      claims: { org_id: 'campolac', perms: ['orders:create'] },
    });
    const verifier = new JwksTokenVerifier({
      issuer: ISSUER,
      audience: AUDIENCE,
      jwksUri,
      claimMapping: { tenantId: 'org_id', permissions: 'perms' },
    });

    const principal = await verifier.verify(token);

    expect(principal.tenantId).toBe('campolac');
    expect(principal.permissions).toEqual(['orders:create']);
  });

  it('falls back to the defaults when claimMapping fields are explicitly undefined (env vars not set)', async () => {
    const { token, jwksUri } = await buildSignedToken();
    // Mirrors how apps/agent-gateway/container.ts builds claimMapping from
    // process.env[...] values that may be undefined — the object itself is
    // defined, but individual fields are `undefined`, not omitted.
    const verifier = new JwksTokenVerifier({
      issuer: ISSUER,
      audience: AUDIENCE,
      jwksUri,
      claimMapping: {
        principalId: undefined,
        tenantId: undefined,
        scopes: undefined,
        roles: undefined,
        permissions: undefined,
      },
    });

    const principal = await verifier.verify(token);

    expect(principal.principalId).toBe('agent-1');
    expect(principal.tenantId).toBe('campolac');
  });

  it('rejects a token with a tampered signature', async () => {
    const { token, jwksUri } = await buildSignedToken();
    const middle = Math.floor(token.length / 2);
    const flipped = token[middle] === 'a' ? 'b' : 'a';
    const tampered = `${token.slice(0, middle)}${flipped}${token.slice(middle + 1)}`;
    const verifier = new JwksTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwksUri });

    await expect(verifier.verify(tampered)).rejects.toThrow(/Token inválido/);
  });

  it('rejects an expired token', async () => {
    const { token, jwksUri } = await buildSignedToken({ expiresIn: '-1h' });
    const verifier = new JwksTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwksUri });

    await expect(verifier.verify(token)).rejects.toThrow(/Token inválido/);
  });

  it('rejects a token issued by a different issuer', async () => {
    const { token, jwksUri } = await buildSignedToken({ issuer: 'https://otro-issuer.test/' });
    const verifier = new JwksTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwksUri });

    await expect(verifier.verify(token)).rejects.toThrow(/Token inválido/);
  });

  it('rejects a token issued for a different audience', async () => {
    const { token, jwksUri } = await buildSignedToken({ audience: 'otro-recurso' });
    const verifier = new JwksTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwksUri });

    await expect(verifier.verify(token)).rejects.toThrow(/Token inválido/);
  });

  it('rejects a token missing the required tenantId claim', async () => {
    const { token, jwksUri } = await buildSignedToken({ claims: { tenant_id: undefined } });
    const verifier = new JwksTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwksUri });

    await expect(verifier.verify(token)).rejects.toThrow(/claims requeridos/);
  });
});
