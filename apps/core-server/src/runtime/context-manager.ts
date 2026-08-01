/**
 * Gestiona el estado compartido durante la ejecución de un workflow
 * - Almacena outputs de pasos anteriores
 * - Resuelve referencias a variables ({{ steps.X.output.Y }})
 * - Mantiene un historial de logs
 */
export interface ExecutionLog {
  stepId: string;
  timestamp: Date;
  level: 'info' | 'error' | 'debug';
  message: string;
  data?: unknown;
}

export interface ExecutionSnapshot {
  stepOutputs: Record<string, unknown>;
  variables: Record<string, unknown>;
  logs: ExecutionLog[];
}

export class ContextManager {
  private stepOutputs = new Map<string, unknown>();
  private logs: ExecutionLog[] = [];
  private variables = new Map<string, unknown>();

  constructor(
    private workflowId: string,
    private executionId: string,
    private tenantId: string,
  ) {}

  /**
   * Resuelve un string con referencias a variables/outputs
   * Formato: "{{ steps.step-id.output.field }}" o "{{ variables.name }}"
   */
  resolveInput(input: unknown): unknown {
    if (typeof input === 'string') {
      return this.resolveString(input);
    }

    if (typeof input === 'object' && input !== null) {
      if (Array.isArray(input)) {
        return input.map((item) => this.resolveInput(item));
      }
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        resolved[key] = this.resolveInput(value);
      }
      return resolved;
    }

    return input;
  }

  private resolveString(str: string): unknown {
    // Patrón: {{ steps.step-0.output.campo }}
    const stepsMatch = str.match(/^\{\{\s*steps\.([a-zA-Z0-9-]+)\.output\.(.*?)\s*\}\}$/);
    if (stepsMatch) {
      const [, stepId, path] = stepsMatch;
      const output = this.stepOutputs.get(stepId);
      return this.getNestedValue(output, path);
    }

    // Patrón: {{ variables.nombre }}
    const varsMatch = str.match(/^\{\{\s*variables\.([a-zA-Z0-9-_]+)\s*\}\}$/);
    if (varsMatch) {
      const [, varName] = varsMatch;
      return this.variables.get(varName);
    }

    // Patrón: {{ steps.step-0.output }} (output completo)
    const fullOutputMatch = str.match(/^\{\{\s*steps\.([a-zA-Z0-9-]+)\.output\s*\}\}$/);
    if (fullOutputMatch) {
      const [, stepId] = fullOutputMatch;
      return this.stepOutputs.get(stepId);
    }

    return str;
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    if (!obj) return undefined;

    let current = obj;
    let remaining = path;

    while (remaining) {
      // Handle array index notation: "items[0]" or "items[0].name"
      const arrayMatch = remaining.match(/^([a-zA-Z0-9_]+)\[(\d+)\](\.(.*))?$/);
      if (arrayMatch) {
        const [, propName, index, , rest] = arrayMatch;
        if (typeof current === 'object' && current !== null) {
          const prop = (current as Record<string, unknown>)[propName];
          if (Array.isArray(prop)) {
            current = prop[parseInt(index)];
            remaining = rest || '';
          } else {
            return undefined;
          }
        } else {
          return undefined;
        }
      } else {
        // Handle regular dot notation
        const dotMatch = remaining.match(/^([a-zA-Z0-9_]+)(\.(.*))?$/);
        if (dotMatch) {
          const [, propName, , rest] = dotMatch;
          if (typeof current === 'object' && current !== null) {
            current = (current as Record<string, unknown>)[propName];
            remaining = rest || '';
          } else {
            return undefined;
          }
        } else {
          return undefined;
        }
      }
    }

    return current;
  }

  setStepOutput(stepId: string, output: unknown): void {
    this.stepOutputs.set(stepId, output);
  }

  getStepOutput(stepId: string): unknown {
    return this.stepOutputs.get(stepId);
  }

  setVariable(name: string, value: unknown): void {
    this.variables.set(name, value);
  }

  addLog(stepId: string, level: 'info' | 'error' | 'debug', message: string, data?: unknown): void {
    this.logs.push({
      stepId,
      timestamp: new Date(),
      level,
      message,
      data,
    });
  }

  getSnapshot(): ExecutionSnapshot {
    return {
      stepOutputs: Object.fromEntries(this.stepOutputs),
      variables: Object.fromEntries(this.variables),
      logs: [...this.logs],
    };
  }

  getLogs(): ExecutionLog[] {
    return [...this.logs];
  }
}
