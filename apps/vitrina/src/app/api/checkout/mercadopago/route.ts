import { NextResponse } from 'next/server';
import { createMercadopagoPreference } from '@/lib/mercadopago';
import { createOrder, type OrderItemInput } from '@/lib/supabase/orders';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

interface CheckoutBody {
  slug: string;
  items: OrderItemInput[];
  customer: { name: string; address?: string };
}

interface PaymentSettingsRow {
  mercadopago_access_token: string | null;
  mercadopago_enabled: boolean;
}

function isCheckoutBody(value: unknown): value is CheckoutBody {
  if (typeof value !== 'object' || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.slug === 'string' &&
    Array.isArray(body.items) &&
    body.items.length > 0 &&
    typeof body.customer === 'object' &&
    body.customer !== null &&
    typeof (body.customer as Record<string, unknown>).name === 'string'
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de solicitud inválido.' }, { status: 400 });
  }

  if (!isCheckoutBody(body)) {
    return NextResponse.json({ error: 'Faltan datos del pedido.' }, { status: 400 });
  }

  const origin = new URL(request.url).origin;

  const order = await createOrder({
    slug: body.slug,
    origin,
    customerName: body.customer.name,
    customerAddress: body.customer.address?.trim() || null,
    items: body.items,
    paymentMethod: 'mercadopago',
  });

  if (!order) {
    return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });
  }

  // `business_payment_settings` no tiene política de lectura pública (ver
  // sql/schema.sql) — el access token solo puede leerse server-side, acá.
  const supabase = createSupabaseServiceClient();
  const { data: paymentSettings, error: settingsError } = await supabase
    .from('business_payment_settings')
    .select('mercadopago_access_token, mercadopago_enabled')
    .eq('business_id', order.businessId)
    .maybeSingle()
    .returns<PaymentSettingsRow>();

  if (settingsError || !paymentSettings?.mercadopago_enabled || !paymentSettings.mercadopago_access_token) {
    return NextResponse.json({ error: 'Este negocio no tiene Mercado Pago habilitado.' }, { status: 400 });
  }

  try {
    const { initPoint } = await createMercadopagoPreference({
      accessToken: paymentSettings.mercadopago_access_token,
      currency: order.currency,
      externalReference: order.id,
      items: body.items.map((item) => ({
        id: item.productId,
        title: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
      })),
      backUrls: {
        success: `${origin}/c/${body.slug}?pago=exitoso`,
        failure: `${origin}/c/${body.slug}?pago=fallido`,
        pending: `${origin}/c/${body.slug}?pago=pendiente`,
      },
    });

    return NextResponse.json({ initPoint, trackingUrl: order.trackingUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No pudimos iniciar el pago con Mercado Pago.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
