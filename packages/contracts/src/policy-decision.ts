/**
 * Resultado de autorizar una invocación (RFC-000 §11): no binario — un
 * tercer estado, `require_approval`, existe para acciones de alto riesgo
 * que se ejecutan solo tras confirmación humana explícita.
 *
 * El canal de esa confirmación (cómo se aprueba, quién la ve, cómo se
 * reanuda la invocación) todavía no está definido — RFC-000 lo señala
 * explícitamente como una pregunta abierta ("Riesgos abiertos", punto 4),
 * no como algo resuelto acá. Este tipo modela solo la *decisión*.
 */
export type PolicyDecision =
  | { readonly decision: 'allow' }
  | { readonly decision: 'deny'; readonly reason: string }
  | { readonly decision: 'require_approval'; readonly reason: string };
