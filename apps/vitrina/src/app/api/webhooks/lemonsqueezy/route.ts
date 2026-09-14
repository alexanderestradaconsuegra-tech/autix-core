import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

// Necesita Node (crypto, timing-safe compare) — no correr en el edge runtime.
export const runtime = 'nodejs';

interface LemonSqueezyWebhookPayload {
  meta?: {
    event_name?: string;
    custom_data?: { business_id?: string };
  };
  data?: {
    attributes?: { status?: string };
  };
}

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(signatureHeader, 'utf8');

  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

/**
 * Lemon Squeezy notifica acá cuando se completa el pago de la licencia.
 * Configúralo en el dashboard de Lemon Squeezy → Settings → Webhooks:
 * URL = https://tu-dominio/api/webhooks/lemonsqueezy, evento order_created,
 * y usa el mismo secreto en LEMONSQUEEZY_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook no configurado en el servidor.' }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-signature');

  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Firma inválida.' }, { status: 401 });
  }

  let payload: LemonSqueezyWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as LemonSqueezyWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const eventName = payload.meta?.event_name;
  const businessId = payload.meta?.custom_data?.business_id;
  const orderStatus = payload.data?.attributes?.status;

  if (eventName === 'order_created' && businessId && orderStatus === 'paid') {
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.from('businesses').update({ license_status: 'active' }).eq('id', businessId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
