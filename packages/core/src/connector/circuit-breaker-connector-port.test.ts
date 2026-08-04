import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toTenantId, toToolId } from '@autix/contracts';

import { CircuitBreakerConnectorPort } from './circuit-breaker-connector-port.js';
import type {
  ConnectorInvokeRequest,
  ConnectorInvokeResult,
  ConnectorPort,
} from './connector-port.js';

const REQUEST: ConnectorInvokeRequest = {
  toolId: toToolId('campolac.productos.consultar'),
  input: {},
  context: { tenantId: toTenantId('campolac'), traceId: 'trace-1' },
};

class ScriptedConnectorPort implements ConnectorPort {
  callCount = 0;
  private readonly results: ConnectorInvokeResult[];

  constructor(results: readonly ConnectorInvokeResult[]) {
    this.results = [...results];
  }

  healthCheck() {
    return Promise.resolve({ status: 'ok' as const });
  }

  invoke(): Promise<ConnectorInvokeResult> {
    const result = this.results[Math.min(this.callCount, this.results.length - 1)];
    this.callCount += 1;
    return Promise.resolve(result ?? { success: true, output: {} });
  }

  /**
   * Reemplaza el guion de resultados restante, sin tocar `callCount`
   * (para simular un cambio de comportamiento a mitad de test sin perder
   * el conteo acumulado de llamadas).
   */
  reset(results: readonly ConnectorInvokeResult[]): void {
    this.results.length = 0;
    this.results.push(...results);
  }
}

const UNAVAILABLE: ConnectorInvokeResult = {
  success: false,
  error: { code: 'CONNECTOR_UNAVAILABLE', message: 'no responde' },
};
const SUCCESS: ConnectorInvokeResult = { success: true, output: { ok: true } };
const BUSINESS_ERROR: ConnectorInvokeResult = {
  success: false,
  error: { code: 'NOT_FOUND', message: 'no encontrado' },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CircuitBreakerConnectorPort', () => {
  it('passes results through unchanged while closed', async () => {
    const inner = new ScriptedConnectorPort([SUCCESS]);
    const breaker = new CircuitBreakerConnectorPort(inner);

    expect(await breaker.invoke(REQUEST)).toEqual(SUCCESS);
  });

  it('does not open on repeated business errors (only CONNECTOR_UNAVAILABLE counts)', async () => {
    const inner = new ScriptedConnectorPort([BUSINESS_ERROR]);
    const breaker = new CircuitBreakerConnectorPort(inner, { failureThreshold: 2 });

    await breaker.invoke(REQUEST);
    await breaker.invoke(REQUEST);
    await breaker.invoke(REQUEST);

    expect(inner.callCount).toBe(3); // nunca se abrió, siguió llamando al inner
  });

  it('opens after reaching the failure threshold of consecutive CONNECTOR_UNAVAILABLE', async () => {
    const inner = new ScriptedConnectorPort([UNAVAILABLE]);
    const breaker = new CircuitBreakerConnectorPort(inner, { failureThreshold: 2 });

    await breaker.invoke(REQUEST); // fallo 1
    await breaker.invoke(REQUEST); // fallo 2 -> abre

    const result = await breaker.invoke(REQUEST); // debería cortar antes de llegar al inner
    expect(inner.callCount).toBe(2);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('CONNECTOR_UNAVAILABLE');
  });

  it('a success resets the consecutive failure count so it never opens from intermittent failures', async () => {
    const inner = new ScriptedConnectorPort([
      UNAVAILABLE,
      SUCCESS,
      UNAVAILABLE,
      SUCCESS,
      UNAVAILABLE,
    ]);
    const breaker = new CircuitBreakerConnectorPort(inner, { failureThreshold: 2 });

    await breaker.invoke(REQUEST); // fallo (1 consecutivo)
    await breaker.invoke(REQUEST); // éxito -> resetea
    await breaker.invoke(REQUEST); // fallo (1 consecutivo otra vez)
    await breaker.invoke(REQUEST); // éxito -> resetea
    const result = await breaker.invoke(REQUEST); // fallo (1 consecutivo)

    expect(inner.callCount).toBe(5); // nunca cortó
    expect(result.success).toBe(false);
  });

  it('stays open until resetTimeoutMs elapses', async () => {
    const inner = new ScriptedConnectorPort([UNAVAILABLE]);
    const breaker = new CircuitBreakerConnectorPort(inner, {
      failureThreshold: 1,
      resetTimeoutMs: 10_000,
    });

    await breaker.invoke(REQUEST); // abre

    vi.setSystemTime(5_000);
    await breaker.invoke(REQUEST); // todavía dentro del reset timeout

    expect(inner.callCount).toBe(1); // el segundo call se cortó, nunca llegó al inner
  });

  it('tries the inner connector again (half-open) once resetTimeoutMs elapses, and closes on success', async () => {
    const inner = new ScriptedConnectorPort([UNAVAILABLE, SUCCESS]);
    const breaker = new CircuitBreakerConnectorPort(inner, {
      failureThreshold: 1,
      resetTimeoutMs: 10_000,
    });

    await breaker.invoke(REQUEST); // abre

    vi.setSystemTime(10_001);
    const result = await breaker.invoke(REQUEST); // half-open, prueba el inner, tiene éxito

    expect(inner.callCount).toBe(2);
    expect(result.success).toBe(true);

    // ya cerrado: una falla ahora necesita el umbral completo de nuevo
    inner.reset([UNAVAILABLE]);
    const afterClose = await breaker.invoke(REQUEST);
    expect(afterClose.success).toBe(false);
    expect(inner.callCount).toBe(3); // no se cortó — el circuito estaba cerrado
  });

  it('re-opens immediately if the half-open trial also fails', async () => {
    const inner = new ScriptedConnectorPort([UNAVAILABLE, UNAVAILABLE, UNAVAILABLE]);
    const breaker = new CircuitBreakerConnectorPort(inner, {
      failureThreshold: 1,
      resetTimeoutMs: 10_000,
    });

    await breaker.invoke(REQUEST); // abre

    vi.setSystemTime(10_001);
    await breaker.invoke(REQUEST); // half-open, falla -> vuelve a abrir

    const result = await breaker.invoke(REQUEST); // debería cortar de nuevo, sin esperar el timeout otra vez
    expect(inner.callCount).toBe(2); // el tercer invoke no llegó al inner
    expect(result.success).toBe(false);
  });
});
