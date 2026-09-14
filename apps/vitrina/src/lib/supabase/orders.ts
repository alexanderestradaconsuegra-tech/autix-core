import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export type DeliveryStatus = 'received' | 'preparing' | 'out_for_delivery' | 'delivered';
export type PaymentMethod = 'whatsapp' | 'mercadopago';

export interface OrderItemInput {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface TrackedOrder {
  id: string;
  trackingToken: string;
  trackingUrl: string;
}

interface BusinessLookupRow {
  id: string;
  slug: string;
  name: string;
  currency: string;
}

interface OrderRow {
  id: string;
  tracking_token: string;
}

/**
 * Crea un pedido para un negocio activo y devuelve su link de seguimiento
 * privado. Usado tanto por el flujo de WhatsApp (para incluir el link en el
 * mensaje) como por el checkout de Mercado Pago.
 */
export async function createOrder(params: {
  slug: string;
  origin: string;
  customerName: string;
  customerAddress: string | null;
  items: OrderItemInput[];
  paymentMethod: PaymentMethod;
}): Promise<(TrackedOrder & { businessId: string; businessName: string; currency: string }) | null> {
  const supabase = createSupabaseServiceClient();

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id, slug, name, currency')
    .eq('slug', params.slug)
    .eq('is_active', true)
    .maybeSingle()
    .returns<BusinessLookupRow>();

  if (businessError || !business) return null;

  const total = params.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      business_id: business.id,
      customer_name: params.customerName,
      customer_address: params.customerAddress,
      items: params.items,
      total,
      payment_method: params.paymentMethod,
    })
    .select('id, tracking_token')
    .single()
    .returns<OrderRow>();

  if (orderError || !order) return null;

  return {
    id: order.id,
    trackingToken: order.tracking_token,
    trackingUrl: `${params.origin}/c/${business.slug}/pedido/${order.tracking_token}`,
    businessId: business.id,
    businessName: business.name,
    currency: business.currency,
  };
}

export interface TrackedOrderDetail {
  businessName: string;
  currency: string;
  customerName: string;
  items: OrderItemInput[];
  total: number;
  deliveryStatus: DeliveryStatus;
  createdAt: string;
}

interface OrderDetailRow {
  customer_name: string;
  items: OrderItemInput[];
  total: number;
  delivery_status: DeliveryStatus;
  created_at: string;
  businesses: { name: string; currency: string } | { name: string; currency: string }[] | null;
}

export async function getOrderByTrackingToken(slug: string, token: string): Promise<TrackedOrderDetail | null> {
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from('orders')
    .select(
      'customer_name, items, total, delivery_status, created_at, businesses!inner(name, currency, slug)',
    )
    .eq('tracking_token', token)
    .eq('businesses.slug', slug)
    .maybeSingle()
    .returns<OrderDetailRow>();

  if (error || !data) return null;

  const business = Array.isArray(data.businesses) ? data.businesses[0] : data.businesses;
  if (!business) return null;

  return {
    businessName: business.name,
    currency: business.currency,
    customerName: data.customer_name,
    items: data.items,
    total: Number(data.total),
    deliveryStatus: data.delivery_status,
    createdAt: data.created_at,
  };
}
