'use client';

import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { useCartStore } from '@/store/cart-store';
import { buildWhatsappOrderUrl } from '@/lib/whatsapp';
import type { Business } from '@/lib/types';

export function OrderModal({ business, onClose }: { business: Business; onClose: () => void }) {
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (name.trim().length < 2) {
      setError('Ingresa tu nombre completo.');
      return;
    }

    try {
      const url = buildWhatsappOrderUrl({
        phone: business.phone,
        businessName: business.name,
        customer: { name: name.trim(), address: address.trim() },
        items,
        currency: business.currency,
      });
      window.open(url, '_blank', 'noopener,noreferrer');
      clearCart();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos generar el pedido.');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
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
          className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white active:bg-emerald-700"
        >
          Confirmar y enviar por WhatsApp
        </button>
      </form>
    </div>
  );
}
