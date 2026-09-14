'use client';

import { useState, type FormEvent } from 'react';
import { Star, X } from 'lucide-react';
import { useCartStore } from '@/store/cart-store';
import { buildWhatsappOrderUrl } from '@/lib/whatsapp';
import type { Business } from '@/lib/types';

export function OrderModal({ business, onClose }: { business: Business; onClose: () => void }) {
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [payingOnline, setPayingOnline] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);

  function readCustomer(): { name: string; address: string } | null {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError('Ingresa tu nombre completo.');
      return null;
    }
    setError(null);
    return { name: trimmedName, address: address.trim() };
  }

  async function createOrderRecord(customer: { name: string; address: string }): Promise<string | null> {
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: business.slug,
          customer,
          items: items.map((item) => ({
            productId: item.productId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
          })),
        }),
      });
      const data = (await response.json()) as { trackingUrl?: string };
      return response.ok ? (data.trackingUrl ?? null) : null;
    } catch {
      // El pedido igual se puede enviar por WhatsApp sin link de seguimiento
      // si el registro falla — no bloqueamos la venta por esto.
      return null;
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const customer = readCustomer();
    if (!customer) return;

    setSending(true);
    const orderTrackingUrl = await createOrderRecord(customer);

    try {
      const url = buildWhatsappOrderUrl({
        phone: business.phone,
        businessName: business.name,
        customer,
        items,
        currency: business.currency,
        trackingUrl: orderTrackingUrl ?? undefined,
      });
      window.open(url, '_blank', 'noopener,noreferrer');
      clearCart();
      setTrackingUrl(orderTrackingUrl);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos generar el pedido.');
    } finally {
      setSending(false);
    }
  }

  async function handleMercadopagoCheckout() {
    const customer = readCustomer();
    if (!customer) return;

    setPayingOnline(true);
    try {
      const response = await fetch('/api/checkout/mercadopago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: business.slug,
          customer,
          items: items.map((item) => ({
            productId: item.productId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
          })),
        }),
      });

      const data = (await response.json()) as { initPoint?: string; error?: string };
      if (!response.ok || !data.initPoint) {
        throw new Error(data.error ?? 'No pudimos iniciar el pago.');
      }

      clearCart();
      window.location.href = data.initPoint;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos iniciar el pago con Mercado Pago.');
      setPayingOnline(false);
    }
  }

  if (submitted) {
    return <ConfirmationPanel business={business} trackingUrl={trackingUrl} onClose={onClose} />;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-900">Datos de entrega</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5 text-neutral-400" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Nombre completo *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Juan Pérez"
              autoFocus
              className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">
              Dirección / referencia de delivery (opcional)
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Av. Providencia 1234, depto 5B"
              rows={2}
              className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {error ? <p className="mt-3 text-xs font-medium text-red-500">{error}</p> : null}

        <button
          type="submit"
          disabled={sending}
          className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-60 active:bg-emerald-700"
        >
          {sending ? 'Enviando...' : 'Confirmar y enviar por WhatsApp'}
        </button>

        {business.acceptsMercadopago ? (
          <button
            type="button"
            disabled={payingOnline}
            onClick={() => void handleMercadopagoCheckout()}
            className="mt-2 w-full rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-700 disabled:opacity-60"
          >
            {payingOnline ? 'Redirigiendo a Mercado Pago...' : 'Pagar en línea con Mercado Pago'}
          </button>
        ) : null}
      </form>
    </div>
  );
}

function ConfirmationPanel({
  business,
  trackingUrl,
  onClose,
}: {
  business: Business;
  trackingUrl: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-t-2xl bg-white p-5 text-center sm:rounded-2xl"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
          🎉
        </div>
        <div>
          <h2 className="text-base font-semibold text-neutral-900">¡Pedido enviado!</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Revisa WhatsApp para confirmar con {business.name}.
          </p>
        </div>

        {trackingUrl ? (
          <a
            href={trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-700"
          >
            Seguir mi pedido
          </a>
        ) : null}

        {business.googleReviewsUrl ? (
          <a
            href={business.googleReviewsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-50 py-3 text-sm font-semibold text-amber-700"
          >
            <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
            Déjanos tu opinión en Google
          </a>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white active:bg-emerald-700"
        >
          Listo
        </button>
      </div>
    </div>
  );
}
