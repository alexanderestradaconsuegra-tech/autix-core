import { toPrincipalId, toTenantId, AutixError, type Principal } from '@autix/contracts';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import type { TokenVerifier } from './token-verifier.js';

/**
 * Nombres de claims del JWT que se mapean a cada campo de `Principal`.
 * Distintos IdPs (Auth0, WorkOS, Keycloak, Azure AD...) usan nombres de
 * claim distintos para lo mismo (tenant, roles, permisos) — este mapeo es
 * la única superficie que cambia entre proveedores, y es configuración,
 * nunca código nuevo (RFC-000: "el Core nunca depende de un proveedor de
 * identidad específico").
 */
export interface JwksTokenVerifierClaimMapping {
  /** Default: `'sub'`. */
  readonly principalId?: string;
  /** Default: `'tenant_id'`. */
  readonly tenantId?: string;
  /** Default: `'scope'` (string separado por espacios, RFC 6749 §3.3) o un array de strings. */
  readonly scopes?: string;
  /** Default: `'roles'`. */
  readonly roles?: string;
  /** Default: `'permissions'`. */
  readonly permissions?: string;
}

export interface JwksTokenVerifierOptions {
  /** El "iss" (issuer) esperado — el Authorization Server que emitió el token. */
  readonly issuer: string;
  /** El "aud" (audience) esperado — identifica a este Resource Server. */
  readonly audience: string;
  /** La URL del JWKS del Authorization Server (p. ej. `https://TU_DOMINIO/.well-known/jwks.json`). */
  readonly jwksUri: string;
  readonly claimMapping?: JwksTokenVerifierClaimMapping;
  /** Tolerancia de reloj en segundos para "exp"/"nbf". Default: 5. */
  readonly clockToleranceSeconds?: number;
}

const DEFAULT_CLAIM_MAPPING: Required<JwksTokenVerifierClaimMapping> = {
  principalId: 'sub',
  tenantId: 'tenant_id',
  scopes: 'scope',
  roles: 'roles',
  permissions: 'permissions',
};

const DEFAULT_CLOCK_TOLERANCE_SECONDS = 5;

/**
 * Un valor de claim puede llegar como array de strings (Keycloak/Azure AD
 * suelen emitir `roles`/`scp` así) o como un string separado por espacios
 * (RFC 6749 §3.3, el formato clásico de `scope`). Se soportan ambos sin
 * que el operador tenga que saber cuál usa su IdP.
 */
function toStringArray(value: unknown): readonly string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    return value.split(/\s+/).filter((item) => item.length > 0);
  }
  return undefined;
}

/**
 * `TokenVerifier` (Sprint 15) sobre JWT + JWKS: verifica la firma del token
 * contra las claves públicas del Authorization Server configurado
 * (`createRemoteJWKSet` de `jose` cachea las claves en memoria y las
 * refresca automáticamente cuando aparece un `kid` que no conoce, con
 * `cooldownDuration` para no martillar el endpoint JWKS ante un token
 * malicioso con un `kid` inventado) — nunca introspección remota por
 * invocación.
 *
 * Es la única implementación concreta que este Core necesita: al ser JWT +
 * JWKS estándar de OIDC, sirve igual para Auth0, WorkOS, Keycloak, Azure AD
 * o cualquier otro Authorization Server compatible — cambiar de proveedor
 * es cuestión de `issuer`/`audience`/`jwksUri`/`claimMapping`, nunca una
 * clase nueva.
 */
export class JwksTokenVerifier implements TokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly claimMapping: Required<JwksTokenVerifierClaimMapping>;

  constructor(private readonly options: JwksTokenVerifierOptions) {
    this.jwks = createRemoteJWKSet(new URL(options.jwksUri));
    this.claimMapping = {
      principalId: options.claimMapping?.principalId ?? DEFAULT_CLAIM_MAPPING.principalId,
      tenantId: options.claimMapping?.tenantId ?? DEFAULT_CLAIM_MAPPING.tenantId,
      scopes: options.claimMapping?.scopes ?? DEFAULT_CLAIM_MAPPING.scopes,
      roles: options.claimMapping?.roles ?? DEFAULT_CLAIM_MAPPING.roles,
      permissions: options.claimMapping?.permissions ?? DEFAULT_CLAIM_MAPPING.permissions,
    };
  }

  async verify(token: string): Promise<Principal> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.jwks, {
        issuer: this.options.issuer,
        audience: this.options.audience,
        clockTolerance: this.options.clockToleranceSeconds ?? DEFAULT_CLOCK_TOLERANCE_SECONDS,
      }));
    } catch (error) {
      throw new AutixError(
        'UNAUTHORIZED',
        `Token inválido: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }

    const principalIdValue = payload[this.claimMapping.principalId];
    const tenantIdValue = payload[this.claimMapping.tenantId];
    if (typeof principalIdValue !== 'string' || typeof tenantIdValue !== 'string') {
      throw new AutixError(
        'UNAUTHORIZED',
        `El token no trae los claims requeridos ("${this.claimMapping.principalId}"/"${this.claimMapping.tenantId}").`,
      );
    }

    return {
      principalId: toPrincipalId(principalIdValue),
      tenantId: toTenantId(tenantIdValue),
      grantedScopes: toStringArray(payload[this.claimMapping.scopes]) ?? [],
      roles: toStringArray(payload[this.claimMapping.roles]),
      permissions: toStringArray(payload[this.claimMapping.permissions]),
      claims: payload,
    };
  }
}
