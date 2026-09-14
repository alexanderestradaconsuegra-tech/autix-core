import type { CartItem } from '@/store/cart-store';
import { formatCurrency } from '@/lib/currency';

export interface OrderCustomer {
  name: string;
  address?: string;
}

/** E.164 sin el '+': código de país + número, solo dígitos, 8 a 15 caracteres. */
export function isValidWhatsappPhone(phone: string): boolean {
  return /^\d{8,15}$/.test(normalizePhone(phone));
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.price, 0);
}

export function buildOrderMessage(params: {
  businessName: string;
  customer: OrderCustomer;
  items: CartItem[];
  currency: string;
}): string {
  const { businessName, customer, items, currency } = params;

  const lines: string[] = [`🛒 *NUEVO PEDIDO - ${businessName}*`, ''];

  lines.push(`👤 *Cliente:* ${customer.name}`);
  if (customer.address?.trim()) {
    lines.push(`📍 *Dirección:* ${customer.address.trim()}`);
  }

  lines.push('', '*Detalle del pedido:*');
  for (const item of items) {
    lines.push(`• ${item.quantity}x ${item.name} (${formatCurrency(item.price, currency)})`);
  }

  lines.push('', `💰 *Total a pagar:* ${formatCurrency(cartTotal(items), currency)}`);

  return lines.join('\n');
}

export function buildWhatsappOrderUrl(params: {
  phone: string;
  businessName: string;
  customer: OrderCustomer;
  items: CartItem[];
  currency: string;
}): string {
  const phone = normalizePhone(params.phone);
  if (!isValidWhatsappPhone(phone)) {
    throw new Error('El WhatsApp del negocio no está configurado correctamente.');
  }
  if (params.items.length === 0) {
    throw new Error('El carrito está vacío.');
  }

  const message = buildOrderMessage(params);
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
