import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getOrderByTrackingToken } from '@/lib/supabase/orders';
import { DeliveryStatusStepper } from '@/components/catalog/DeliveryStatusStepper';
import { formatCurrency } from '@/lib/currency';

export const revalidate = 0;

type TrackingPageParams = { params: Promise<{ slug: string; token: string }> };

export async function generateMetadata({ params }: TrackingPageParams): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Seguimiento de pedido — ${slug}` };
}

export default async function OrderTrackingPage({ params }: TrackingPageParams) {
  const { slug, token } = await params;
  const order = await getOrderByTrackingToken(slug, token);

  if (!order) notFound();

  return (
    <main className="min-h-dvh bg-neutral-50 px-4 py-8">
      <div className="mx-auto max-w-md space-y-5">
        <div>
          <p className="text-xs font-medium text-neutral-400">{order.businessName}</p>
          <h1 className="text-lg font-semibold text-neutral-900">Tu pedido</h1>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <DeliveryStatusStepper status={order.deliveryStatus} />
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="mb-2 text-xs font-semibold text-neutral-500">Detalle</p>
          <ul className="space-y-1.5">
            {order.items.map((item) => (
              <li key={item.productId} className="flex justify-between text-sm text-neutral-700">
                <span>
                  {item.quantity}x {item.name}
                </span>
                <span className="font-medium">{formatCurrency(item.price * item.quantity, order.currency)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-neutral-100 pt-3 text-sm">
            <span className="font-medium text-neutral-600">Total</span>
            <span className="font-bold text-neutral-900">{formatCurrency(order.total, order.currency)}</span>
          </div>
        </div>

        <p className="text-center text-xs text-neutral-400">
          Pedido a nombre de {order.customerName} · {new Date(order.createdAt).toLocaleString('es-CO')}
        </p>
      </div>
    </main>
  );
}
