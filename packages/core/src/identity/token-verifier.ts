import type { Principal } from '@autix/contracts';

/**
 * `TokenVerifier` (Sprint 15, RFC-000 §14 paso 2): abstracción propia para
 * resolver un `Principal` a partir de un token de acceso — deliberadamente
 * *no* acoplada al middleware OAuth del SDK oficial de MCP (que está
 * construido sobre Express, `server/auth/*`) ni a ningún tipo de ese SDK
 * (`AuthInfo`, `OAuthTokenVerifier`). Vive en `@autix/core`, no en
 * `apps/agent-gateway`, porque es infraestructura de identidad genérica y
 * reutilizable — cualquier frontera HTTP del Core (el Agent Gateway hoy,
 * `@autix/core-server` a futuro) puede depender de este mismo Port sin
 * duplicar lógica de verificación.
 *
 * Autix Core actúa únicamente como **Resource Server** (RFC-000, decisión
 * confirmada con el usuario): nunca implementa un Authorization Server
 * propio (`/authorize`, `/token`, `/register`) — delega la autenticación a
 * cualquier proveedor OAuth 2.1/OIDC externo (Auth0, WorkOS, Keycloak,
 * Azure AD, etc.) y solo verifica el token que ese proveedor ya emitió.
 * `verify()` rechaza (nunca resuelve a un Principal inválido) si el token
 * es inválido, expiró, o no trae los claims mínimos requeridos —
 * lanza/rechaza con `AutixError('UNAUTHORIZED', ...)`.
 *
 * La implementación concreta (`JwksTokenVerifier`, en este mismo módulo)
 * es intercambiable por diseño: cambiar de Auth0 a Keycloak o cualquier
 * otro IdP OIDC-compliant es una cuestión de configuración (issuer,
 * audience, JWKS URI, nombres de claims), nunca de código nuevo — el Core
 * nunca depende de un proveedor de identidad específico.
 */
export interface TokenVerifier {
  verify(token: string): Promise<Principal>;
}
