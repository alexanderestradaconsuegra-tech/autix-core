/**
 * Ejemplo de invocación de una Tool o Capability, usado para discovery
 * (RFC-000 §8, §12) — few-shot que mejora la precisión de tool-calling del
 * agente, no una validación en runtime.
 */
export interface ToolExample<Input = unknown, Output = unknown> {
  readonly description: string;
  readonly input: Input;
  readonly output: Output;
}
