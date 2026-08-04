import type { AutixErrorShape, TenantId, ToolId } from '@autix/contracts';

/**
 * ConnectorPort (RFC-000 §3, §7, §24): la vista del Core sobre un
 * Connector out-of-process — cómo el Core lo llama para chequear su salud
 * e invocar una Tool. Agnóstico de transporte; `HttpConnectorClient` (este
 * mismo directorio) es la implementación concreta que decide cómo cruzar
 * la red (HTTP + JSON, decisión confirmada con el usuario en Sprint 4).
 *
 * El registro (`register`, RFC-000 §7) NO es un método de este Port:
 * fluye en la dirección contraria — es el Connector el que empuja su
 * manifiesto a `Registry.registerConnector()` (Sprint 3), no el Core el
 * que se lo pide a un Connector. Este Port modela únicamente lo que el
 * Core inicia.
 */
export interface ConnectorPort {
  healthCheck(): Promise<ConnectorHealthCheckResult>;
  invoke(request: ConnectorInvokeRequest): Promise<ConnectorInvokeResult>;
}

export type ConnectorHealthStatus = 'ok' | 'degraded' | 'down';

export interface ConnectorHealthCheckResult {
  readonly status: ConnectorHealthStatus;
  readonly message?: string;
}

export interface ConnectorInvokeContext {
  readonly tenantId: TenantId;
  readonly traceId: string;
  readonly idempotencyKey?: string;
}

export interface ConnectorInvokeRequest {
  readonly toolId: ToolId;
  readonly version?: string;
  readonly input: unknown;
  readonly context: ConnectorInvokeContext;
}

/**
 * Nunca se lanza como excepción para los fallos esperables (de red o de
 * negocio) — es un resultado, igual que `ValidationResult` en
 * `@autix/schemas` (Sprint 2). El caller decide qué hacer con
 * `success: false`, en vez de encadenar try/catch por todo el pipeline.
 */
export type ConnectorInvokeResult =
  | { readonly success: true; readonly output: unknown }
  | { readonly success: false; readonly error: AutixErrorShape };
