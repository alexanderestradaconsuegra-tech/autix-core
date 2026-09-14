const LOCALE_BY_CURRENCY: Record<string, string> = {
  USD: 'en-US',
  EUR: 'de-DE',
  CLP: 'es-CL',
  MXN: 'es-MX',
  COP: 'es-CO',
  PEN: 'es-PE',
  ARS: 'es-AR',
  BRL: 'pt-BR',
  PYG: 'es-PY',
};

// Monedas sin decimales de uso (peso chileno, guaraní, etc.)
const ZERO_DECIMAL_CURRENCIES = new Set(['CLP', 'PYG']);

export function formatCurrency(amount: number, currency: string): string {
  const locale = LOCALE_BY_CURRENCY[currency] ?? 'en-US';
  const maximumFractionDigits = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits,
      minimumFractionDigits: maximumFractionDigits,
    }).format(amount);
  } catch {
    // Código de moneda no reconocido por Intl (ISO 4217 inválido en el registro del negocio).
    return `${currency} ${amount.toFixed(maximumFractionDigits)}`;
  }
}
