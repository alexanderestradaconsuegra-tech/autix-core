import type {
  ConnectorHealthCheckResult,
  ConnectorInvokeRequest,
  ConnectorInvokeResult,
  ConnectorPort,
} from './connector-port.js';

export interface CircuitBreakerOptions {
  /** Fallos consecutivos antes de abrir el circuito. Default 5. */
  readonly failureThreshold?: number;
  /** Cuánto se mantiene abierto antes de permitir un intento de prueba (half-open). Default 30s. */
  readonly resetTimeoutMs?: number;
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT_MS = 30_000;

type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker por Connector (RFC-000 §14, guarda que todos los
 * sprints anteriores dejaron pendiente). Decorator sobre `ConnectorPort`
 * — envuelve cualquier implementación (`HttpConnectorClient` u otra) sin
 * que el `ExecutionEngine` note la diferencia.
 *
 * Solo cuenta como fallo de disponibilidad `CONNECTOR_UNAVAILABLE` (el
 * Connector no respondió) — un error de negocio (`NOT_FOUND`, etc.) o un
 * `CONNECTOR_ERROR` (respuesta mal formada) no abren el circuito: el
 * circuit breaker vigila si el Connector está *ahí*, no si una invocación
 * puntual tuvo éxito.
 *
 * v0 simplificado: en `half-open` se deja pasar la siguiente invocación
 * que llegue (no hay control de concurrencia para permitir "exactamente
 * una" prueba en paralelo) — suficiente para el volumen actual de un solo
 * Connector de prueba; una implementación con locking se justifica cuando
 * haya invocaciones concurrentes reales que lo requieran.
 */
export class CircuitBreakerConnectorPort implements ConnectorPort {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(
    private readonly inner: ConnectorPort,
    private readonly options: CircuitBreakerOptions = {},
  ) {}

  healthCheck(): Promise<ConnectorHealthCheckResult> {
    return this.inner.healthCheck();
  }

  async invoke(request: ConnectorInvokeRequest): Promise<ConnectorInvokeResult> {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt < this.resetTimeoutMs) {
        return {
          success: false,
          error: {
            code: 'CONNECTOR_UNAVAILABLE',
            message: 'El circuito está abierto: el Connector viene fallando repetidamente.',
            details: {
              toolId: request.toolId,
              connectorConsecutiveFailures: this.consecutiveFailures,
            },
          },
        };
      }
      this.state = 'half-open';
    }

    const result = await this.inner.invoke(request);

    if (result.success) {
      this.state = 'closed';
      this.consecutiveFailures = 0;
      return result;
    }

    if (result.error.code !== 'CONNECTOR_UNAVAILABLE') {
      // Fallo de negocio o de forma de respuesta — no es un problema de
      // disponibilidad, no cuenta para el circuit breaker.
      return result;
    }

    this.consecutiveFailures += 1;
    if (this.state === 'half-open' || this.consecutiveFailures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
    return result;
  }

  private get failureThreshold(): number {
    return this.options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
  }

  private get resetTimeoutMs(): number {
    return this.options.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS;
  }
}
