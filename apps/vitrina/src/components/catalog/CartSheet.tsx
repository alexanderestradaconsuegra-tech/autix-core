'use client';

import { useState } from 'react';
import { Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { useCartStore } from '@/store/cart-store';
import { formatCurrency } from '@/lib/currency';
import { cartTotal } from '@/lib/whatsapp';
import { OrderModal } from '@/components/catalog/OrderModal';
import type { Business } from '@/lib/types';

export function CartSheet({ business }: { business: Business }) {
  const items = useCartStore((s) => s.items);
  const incrementItem = useCartStore((s) => s.incrementItem);
  const decrementItem = useCartStore((s) => s.decrementItem);
  const removeItem = useCartStore((s) => s.removeItem);

  const [isSheetOpen, setSheetOpen] = useState(false);
  const [isOrderOpen, setOrderOpen] = useState(false);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = cartTotal(items);

  if (totalItems === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-2xl items-center justify-between rounded-2xl bg-emerald-600 px-4 py-3.5 text-white shadow-lg shadow-emerald-900/20 active:bg-emerald-700"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs">
            {totalItems}
          </span>
          Ver carrito
        </span>
        <span className="text-sm font-bold">{formatCurrency(totalPrice, business.currency)}</span>
      </button>

      {isSheetOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/40"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
                <ShoppingCart className="h-4.5 w-4.5" />
                Tu pedido
              </h2>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Cerrar">
                <X className="h-5 w-5 text-neutral-400" />
              </button>
            </div>

            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.productId} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">{item.name}</p>
                    <p className="text-xs text-neutral-500">
                      {formatCurrency(item.price, business.currency)} c/u
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full bg-neutral-100 px-1.5 py-1">
                    <button
                      type="button"
                      onClick={() => decrementItem(item.productId)}
                      aria-label="Quitar uno"
                      className="flex h-6 w-6 items-center justify-center rounded-full"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-4 text-center text-xs font-semibold">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => incrementItem(item.productId)}
                      aria-label="Agregar uno"
                      className="flex h-6 w-6 items-center justify-center rounded-full"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.productId)}
                    aria-label="Eliminar producto"
                    className="text-neutral-300 active:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
              <span className="text-sm font-medium text-neutral-600">Total</span>
              <span className="text-lg font-bold text-neutral-900">
                {formatCurrency(totalPrice, business.currency)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setSheetOpen(false);
                setOrderOpen(true);
              }}
              className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white active:bg-emerald-700"
            >
              Enviar pedido por WhatsApp
            </button>
          </div>
        </div>
      ) : null}

      {isOrderOpen ? <OrderModal business={business} onClose={() => setOrderOpen(false)} /> : null}
    </>
  );
}
