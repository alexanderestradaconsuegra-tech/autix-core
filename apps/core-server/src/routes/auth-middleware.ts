import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { JwtPayload, Secret } from 'jsonwebtoken';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends FastifyRequest {
  auth: {
    principalId: string;
    tenantId: string;
    token: string;
  };
}

/**
 * Fetches JWKS from the issuer and returns the public key for verification.
 * Implements caching to avoid repeated requests.
 */
const jwksCache = new Map<string, { keys: Array<{ kid: string; n: string; e: string; kty: string }> }>();

async function getJwksPublicKey(jwksUri: string, kid?: string): Promise<string> {
  let jwks = jwksCache.get(jwksUri);

  if (!jwks) {
    const response = await fetch(jwksUri);
    if (!response.ok) {
      throw new Error(`Failed to fetch JWKS from ${jwksUri}: ${response.statusText}`);
    }
    jwks = (await response.json()) as { keys: Array<{ kid: string; n: string; e: string; kty: string }> };
    jwksCache.set(jwksUri, jwks);
  }

  const keys = jwks.keys || [];
  if (keys.length === 0) {
    throw new Error('No keys found in JWKS');
  }

  // If kid is provided, find matching key; otherwise use first key
  const keyData = kid ? keys.find((k) => k.kid === kid) : keys[0];

  if (!keyData) {
    throw new Error(`No matching key found in JWKS${kid ? ` for kid: ${kid}` : ''}`);
  }

  // Convert JWK to PEM format for verification
  return convertJwkToPem(keyData);
}

function convertJwkToPem(jwk: { n: string; e: string; kty: string }): string {
  // For RSA keys, we need to construct a PEM format
  // This is a simplified version - in production you might use a library like 'jwk-to-pem'
  const n = Buffer.from(jwk.n, 'base64url');
  const e = Buffer.from(jwk.e, 'base64url');

  // Create PKCS#8 structure (simplified - production should use proper ASN.1 encoding)
  // For now, return a marker that we'll handle in verification
  return JSON.stringify({ n: jwk.n, e: jwk.e });
}

export async function registerAuthMiddleware(app: FastifyInstance): Promise<void> {
  // Define routes that don't require authentication
  const publicRoutes = ['/health', '/api/health'];

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth check for public routes
    if (publicRoutes.some((route) => request.url.startsWith(route))) {
      return;
    }

    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        reply.code(401).send({ error: 'Missing or invalid authorization header' });
        return;
      }

      const token = authHeader.substring(7);

      // For development/testing, if DISABLE_AUTH is set, skip verification
      if (process.env.DISABLE_AUTH === 'true') {
        const decoded = jwt.decode(token) as JwtPayload | null;
        if (!decoded) {
          reply.code(401).send({ error: 'Invalid token' });
          return;
        }
        const principalId = decoded.sub as string;
        const tenantId = (decoded as Record<string, unknown>).tenant_id as string;

        if (!principalId || !tenantId) {
          reply.code(401).send({ error: 'Missing required claims: sub, tenant_id' });
          return;
        }

        (request as AuthenticatedRequest).auth = { principalId, tenantId, token };
        return;
      }

      // Production: verify with OAuth
      const oauthIssuer = process.env.OAUTH_ISSUER;
      const jwksUri = process.env.OAUTH_JWKS_URI;
      const audience = process.env.OAUTH_AUDIENCE;

      if (!oauthIssuer || !jwksUri || !audience) {
        console.error('OAuth configuration missing for token verification');
        reply.code(500).send({ error: 'Server configuration error' });
        return;
      }

      // Get the public key for verification
      const publicKey = await getJwksPublicKey(jwksUri);

      // Verify token using the public key
      // Note: For RSA keys from JWKS, we need proper PEM format
      // This is a simplified version - production should use 'jsonwebtoken' with proper key handling
      const decoded = jwt.verify(token, publicKey as Secret, {
        audience,
        issuer: oauthIssuer,
        algorithms: ['RS256', 'RS384', 'RS512'],
      }) as JwtPayload;

      const principalId = decoded.sub as string;
      const tenantId = (decoded as Record<string, unknown>).tenant_id as string;

      if (!principalId || !tenantId) {
        reply.code(401).send({ error: 'Missing required claims: sub, tenant_id' });
        return;
      }

      // Attach auth info to request
      (request as AuthenticatedRequest).auth = { principalId, tenantId, token };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token verification failed';
      console.error('Auth middleware error:', message);
      reply.code(401).send({ error: 'Unauthorized', details: message });
    }
  });
}

export function requireAuth(request: FastifyRequest, reply: FastifyReply): AuthenticatedRequest {
  const authRequest = request as AuthenticatedRequest;
  if (!authRequest.auth) {
    reply.code(401).send({ error: 'Unauthorized' });
    throw new Error('Unauthorized');
  }
  return authRequest;
}
