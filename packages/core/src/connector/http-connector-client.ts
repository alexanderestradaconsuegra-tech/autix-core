import { isErrorCode, type AutixErrorShape } from '@autix/contracts';

import type {
  ConnectorHealthCheckResult,
  ConnectorInvokeRequest,
  ConnectorInvokeResult,
  ConnectorPort,
} from './connector-port.js';

export interface HttpConnectorClientOptions {
  readonly baseUrl: string;
  /** Default 10s. RFC-000 §14 habla de timeout configurable *por Tool* —
   * eso todavía no existe (es del Execution Engine); esto es un único
   * timeout por cliente/Connector, deliberadamente más simple. */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const HEALTH_STATUSES = new Set(['ok', 'degraded', 'down']);

function isAutixErrorShape(value: unknown): value is AutixErrorShape {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return isErrorCode(candidate['code']) && typeof candidate['message'] === 'string';
}

function isConnectorInvokeResult(value: unknown): value is ConnectorInvokeResult {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;

  if (candidate['success'] === true) return 'output' in candidate;
  if (candidate['success'] === false) return isAutixErrorShape(candidate['error']);
  return false;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unavailable(message: string, details: Record<string, unknown>): ConnectorInvokeResult {
  return { success: false, error: { code: 'CONNECTOR_UNAVAILABLE', message, details } };
}

function malformedResponse(
  message: string,
  details: Record<string, unknown>,
): ConnectorInvokeResult {
  return { success: false, error: { code: 'CONNECTOR_ERROR', message, details } };
}

/**
 * Implementación HTTP + JSON del `ConnectorPort` (decisión de transporte
 * confirmada con el usuario en Sprint 4 — HTTP + JSON con un sobre simple,
 * no gRPC ni JSON-RPC 2.0).
 *
 * Convención de wire, con dos endpoints en el Connector:
 * - `GET  {baseUrl}/healthz` → `{ status, message? }`.
 * - `POST {baseUrl}/invoke`  → recibe un `ConnectorInvokeRequest`, responde
 *   `{ success: true, output }` o `{ success: false, error }`.
 *
 * HTTP 2xx + un body con esa forma es una respuesta de *aplicación* válida
 * (el Connector procesó la invocación, sea éxito o error de negocio). Todo
 * lo demás — timeout, conexión rechazada, HTTP no-2xx, JSON inválido o con
 * forma inesperada — es un fallo de *transporte*: se sintetiza acá como
 * `CONNECTOR_UNAVAILABLE` (no se pudo completar el intercambio) o
 * `CONNECTOR_ERROR` (se completó, pero la respuesta no es utilizable) —
 * nunca algo que el propio Connector reportó.
 */
export class HttpConnectorClient implements ConnectorPort {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: HttpConnectorClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async healthCheck(): Promise<ConnectorHealthCheckResult> {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        return { status: 'down', message: `HTTP ${response.status}` };
      }

      const body: unknown = await response.json();
      if (
        typeof body === 'object' &&
        body !== null &&
        HEALTH_STATUSES.has((body as Record<string, unknown>)['status'] as string)
      ) {
        return body as ConnectorHealthCheckResult;
      }
      return { status: 'down', message: 'Respuesta de healthcheck con formato inesperado.' };
    } catch (error) {
      return { status: 'down', message: toMessage(error) };
    }
  }

  async invoke(request: ConnectorInvokeRequest): Promise<ConnectorInvokeResult> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/invoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      return unavailable(`No se pudo contactar al Connector: ${toMessage(error)}`, {
        toolId: request.toolId,
      });
    }

    if (!response.ok) {
      return unavailable(`El Connector respondió HTTP ${response.status}.`, {
        toolId: request.toolId,
        status: response.status,
      });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return malformedResponse('El Connector respondió un body que no es JSON válido.', {
        toolId: request.toolId,
      });
    }

    if (!isConnectorInvokeResult(body)) {
      return malformedResponse('El Connector respondió con una forma inesperada.', {
        toolId: request.toolId,
      });
    }

    return body;
  }
}
