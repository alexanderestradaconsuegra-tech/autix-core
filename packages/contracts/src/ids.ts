/**
 * Identificadores branded (RFC-000 §7-§8, RFC-001 §2-§5).
 *
 * Todos los IDs del sistema son strings en runtime, pero cada tipo de ID
 * (ToolId, CapabilityId, ConnectorId...) tiene un significado distinto y no
 * son intercambiables entre sí — un `ConnectorId` pasado donde se espera un
 * `ToolId` es un bug real (invocar el Connector equivocado, autorizar la
 * entidad equivocada). El "branding" a nivel de tipo hace que TypeScript
 * rechace esa confusión en tiempo de compilación sin costo en runtime: en
 * memoria siguen siendo strings planos.
 */

declare const brand: unique symbol;

export type Brand<T, TBrand extends string> = T & { readonly [brand]: TBrand };

function toBrandedId<TBrand extends string>(label: TBrand, value: string): Brand<string, TBrand> {
  if (value.trim().length === 0) {
    throw new Error(`${label} no puede estar vacío.`);
  }
  return value as Brand<string, TBrand>;
}

export type ToolId = Brand<string, 'ToolId'>;
export function toToolId(value: string): ToolId {
  return toBrandedId('ToolId', value);
}

export type CapabilityId = Brand<string, 'CapabilityId'>;
export function toCapabilityId(value: string): CapabilityId {
  return toBrandedId('CapabilityId', value);
}

export type ConnectorId = Brand<string, 'ConnectorId'>;
export function toConnectorId(value: string): ConnectorId {
  return toBrandedId('ConnectorId', value);
}

export type TenantId = Brand<string, 'TenantId'>;
export function toTenantId(value: string): TenantId {
  return toBrandedId('TenantId', value);
}

export type WorkflowId = Brand<string, 'WorkflowId'>;
export function toWorkflowId(value: string): WorkflowId {
  return toBrandedId('WorkflowId', value);
}

export type AgentId = Brand<string, 'AgentId'>;
export function toAgentId(value: string): AgentId {
  return toBrandedId('AgentId', value);
}

export type PrincipalId = Brand<string, 'PrincipalId'>;
export function toPrincipalId(value: string): PrincipalId {
  return toBrandedId('PrincipalId', value);
}
