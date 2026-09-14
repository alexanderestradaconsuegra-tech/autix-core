import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createMercadopagoPreference } from '@/lib/mercadopago';

interface CheckoutItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

interface CheckoutBody {
  slug: string;
  items: CheckoutItem[];
  customer: { name: string; address?: string };
}

interface BusinessRow {
  id: string;
  name: string;
  currency: string;
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

/**
 * Requiere la service role key: `business_payment_settings` no tiene
 * política de lectura pública (ver sql/schema.sql), así que el access
 * token de Mercado Pago del negocio solo puede leerse server-side, acá.
 */
function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY no está configurada en el servidor.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
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

  let supabase: ReturnType<typeof createServiceRoleClient>;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error de configuración del servidor.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id, name, currency')
    .eq('slug', body.slug)
    .eq('is_active', true)
    .maybeSingle()
    .returns<BusinessRow>();

  if (businessError || !business) {
    return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });
  }

  const { data: paymentSettings, error: settingsError } = await supabase
    .from('business_payment_settings')
    .select('mercadopago_access_token, mercadopago_enabled')
    .eq('business_id', business.id)
    .maybeSingle()
    .returns<PaymentSettingsRow>();

  if (settingsError || !paymentSettings?.mercadopago_enabled || !paymentSettings.mercadopago_access_token) {
    return NextResponse.json({ error: 'Este negocio no tiene Mercado Pago habilitado.' }, { status: 400 });
  }

  const total = body.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const { data: orderRow } = await supabase
    .from('orders')
    .insert({
      business_id: business.id,
      customer_name: body.customer.name,
      customer_address: body.customer.address ?? null,
      items: body.items,
      total,
      status: 'sent',
      payment_method: 'mercadopago',
    })
    .select('id')
    .single()
    .returns<{ id: string }>();

  const origin = new URL(request.url).origin;

  try {
    const { initPoint } = await createMercadopagoPreference({
      accessToken: paymentSettings.mercadopago_access_token,
      currency: business.currency,
      externalReference: orderRow?.id ?? `${body.slug}-${Date.now()}`,
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

    return NextResponse.json({ initPoint });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No pudimos iniciar el pago con Mercado Pago.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
