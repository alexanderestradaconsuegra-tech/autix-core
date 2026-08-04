import type { PrincipalId, TenantId } from './ids.js';

/**
 * Principal (RFC-000 §10-§11): quién invoca — un agente autenticado
 * (Hermes, un worker interno, un humano vía dashboard), dentro de un
 * tenant, con un conjunto de scopes concedidos.
 *
 * v0 deliberadamente plano: RFC-000 §9 distingue capas más ricas
 * (Tenant scope, Agent role vía RBAC, Capability delegada por
 * conversación) — acá se colapsan en un único conjunto de
 * `grantedScopes`, suficiente para autorizar contra
 * `ToolContract.requiredScopes`. Delegación (un agente actuando *en
 * nombre de* un usuario humano dentro de una conversación) no está
 * modelada todavía.
 *
 * Sprint 15 (identidad real vía MCP/OAuth) agrega `roles`/`permissions`/
 * `claims`, todos opcionales — un Principal resuelto desde un JWT real
 * (`JwksTokenVerifier`, `@autix/core`) los popula; `ScopePolicyEngine`
 * (Sprint 6) sigue leyendo únicamente `grantedScopes`, sin cambios — estos
 * campos quedan disponibles para un futuro `PolicyEngine` más rico
 * (por rol, por permiso), no consumidos todavía.
 */
export interface Principal {
  readonly principalId: PrincipalId;
  readonly tenantId: TenantId;
  readonly grantedScopes: readonly string[];
  /** Roles del token (p. ej. claim `roles` de un IdP), si el proveedor los emite. */
  readonly roles?: readonly string[];
  /** Permisos finos del token (p. ej. claim `permissions`), si el proveedor los emite. */
  readonly permissions?: readonly string[];
  /** Los claims crudos del token verificado, tal cual — para que un PolicyEngine futuro pueda leer cualquier claim que un IdP concreto agregue, sin que este contrato tenga que anticiparlo. */
  readonly claims?: Readonly<Record<string, unknown>>;
}
