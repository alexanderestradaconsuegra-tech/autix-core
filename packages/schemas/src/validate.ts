import type { z } from 'zod';
import type { AutixErrorShape } from '@autix/contracts';

/**
 * Resultado de validar un input contra un canonical schema (RFC-000 §14,
 * paso 4: "Validación de input_schema → rechazo temprano si no cumple
 * contrato"). El caso de error ya viene en `AutixErrorShape` — listo para
 * devolverse tal cual al agente, sin que el Core tenga que traducirlo.
 */
export type ValidationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: AutixErrorShape };

export function validateAgainstSchema<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): ValidationResult<z.infer<Schema>> {
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'El input no cumple el schema esperado.',
      details: { issues: result.error.issues },
    },
  };
}
