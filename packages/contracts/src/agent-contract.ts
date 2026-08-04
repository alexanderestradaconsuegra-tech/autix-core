import type { AgentId, CapabilityId } from './ids.js';

/**
 * Agent Contract (RFC-001, RC2 Fase 2): una entidad de larga duración que
 * representa un sistema IA conversacional. A diferencia de Capabilities
 * (metadata agnóstica) y Workflows (DAGs estáticos), un Agente es un
 * recurso **con estado** — mantiene conversaciones, memoria y contexto en
 * tiempo de ejecución.
 *
 * Aquí modelamos la **definición estática** del Agente: qué Capabilities
 * puede invocar, qué modelo Claude usa, quién lo controla. El estado de
 * runtime (conversaciones, memory, índice de ejecuciones) vive en otra
 * capa (aún por diseñar en sprints posteriores).
 *
 * IDs legibles y estables (`hermes`, `atenea`, no un UUID) — similar a
 * `WorkflowId` branded que existe desde Sprint 2.
 */
export interface AgentContract {
  readonly id: AgentId;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  /**
   * Modelo Claude que ejecuta este Agente.
   * Ejemplos: 'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'
   */
  readonly model: string;
  /**
   * Capabilities que este Agente puede invocar.
   * Resuelven contra el Registry en tiempo de ejecución.
   */
  readonly capabilities: readonly CapabilityId[];
  /**
   * Configuración opcional de memoria/contexto para conversaciones.
   * Estructura TBD en próximos sprints — aquí es `unknown` para extensibilidad.
   */
  readonly memory?: Readonly<Record<string, unknown>>;
  /**
   * Metadata adicional — configuración de comportamiento, límites, etc.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
