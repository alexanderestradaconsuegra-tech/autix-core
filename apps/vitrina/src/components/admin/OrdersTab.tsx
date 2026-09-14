'use client';

import { useEffect, useState } from 'react';
import { listOrders, updateOrderDeliveryStatus, type AdminOrder, type DeliveryStatus } from '@/lib/supabase/admin';
import { formatCurrency } from '@/lib/currency';
import type { Business } from '@/lib/types';

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  received: 'Recibido',
  preparing: 'Preparando',
  out_for_delivery: 'En camino',
  delivered: 'Entregado',
};

const STATUS_ORDER: DeliveryStatus[] = ['received', 'preparing', 'out_for_delivery', 'delivered'];

export function OrdersTab({ business }: { business: Business }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listOrders(business.id).then((rows) => {
      setOrders(rows);
      setLoading(false);
    });
  }, [business.id]);

  function nextStatus(current: DeliveryStatus): DeliveryStatus | null {
    const currentIndex = STATUS_ORDER.indexOf(current);
    return STATUS_ORDER[currentIndex + 1] ?? null;
  }

  async function advanceStatus(order: AdminOrder) {
    const next = nextStatus(order.deliveryStatus);
    if (!next) return;
    await updateOrderDeliveryStatus(order.id, next);
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, deliveryStatus: next } : o)));
  }

  if (loading) return <p className="py-8 text-center text-sm text-neutral-400">Cargando...</p>;
  if (orders.length === 0) {
    return <p className="py-8 text-center text-sm text-neutral-400">Todavía no llegaron pedidos.</p>;
  }

  return (
    <ul className="space-y-2">
      {orders.map((order) => {
        const isFinal = order.deliveryStatus === 'delivered';
        return (
          <li key={order.id} className="rounded-xl border border-neutral-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900">{order.customerName}</p>
                <p className="text-xs text-neutral-400">
                  {new Date(order.createdAt).toLocaleString('es-CO')} ·{' '}
                  {order.paymentMethod === 'mercadopago' ? 'Mercado Pago' : 'WhatsApp'}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-neutral-900">
                {formatCurrency(order.total, business.currency)}
              </span>
            </div>

            <ul className="mt-2 space-y-0.5">
              {order.items.map((item) => (
                <li key={item.productId} className="text-xs text-neutral-500">
                  {item.quantity}x {item.name}
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                {STATUS_LABELS[order.deliveryStatus]}
              </span>
              {!isFinal && nextStatus(order.deliveryStatus) ? (
                <button
                  type="button"
                  onClick={() => void advanceStatus(order)}
                  className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Marcar como {STATUS_LABELS[nextStatus(order.deliveryStatus) as DeliveryStatus]}
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
