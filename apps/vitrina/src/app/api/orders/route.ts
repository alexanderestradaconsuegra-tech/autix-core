import { NextResponse } from 'next/server';
import { createOrder, type OrderItemInput } from '@/lib/supabase/orders';

interface CreateOrderBody {
  slug: string;
  items: OrderItemInput[];
  customer: { name: string; address?: string };
}

function isCreateOrderBody(value: unknown): value is CreateOrderBody {
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
 * Crea el registro del pedido ANTES de abrir WhatsApp, para poder incluir
 * el link de seguimiento en el mensaje. El envío real del pedido sigue
 * siendo la conversación de WhatsApp — esto solo persiste el estado de
 * entrega para /c/[slug]/pedido/[token] y para el panel /admin.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de solicitud inválido.' }, { status: 400 });
  }

  if (!isCreateOrderBody(body)) {
    return NextResponse.json({ error: 'Faltan datos del pedido.' }, { status: 400 });
  }

  const origin = new URL(request.url).origin;

  try {
    const order = await createOrder({
      slug: body.slug,
      origin,
      customerName: body.customer.name,
      customerAddress: body.customer.address?.trim() || null,
      items: body.items,
      paymentMethod: 'whatsapp',
    });

    if (!order) {
      return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });
    }

    return NextResponse.json({ trackingUrl: order.trackingUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No pudimos registrar el pedido.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
