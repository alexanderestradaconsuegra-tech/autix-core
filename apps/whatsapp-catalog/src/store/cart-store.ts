'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string | null;
}

interface CartState {
  businessSlug: string | null;
  items: CartItem[];
  setBusinessSlug: (slug: string) => void;
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  removeItem: (productId: string) => void;
  incrementItem: (productId: string) => void;
  decrementItem: (productId: string) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      businessSlug: null,
      items: [],

      // El carrito vive en localStorage por navegador: si el visitante entra
      // a un catálogo distinto, se descarta el carrito anterior en vez de
      // mezclar pedidos de dos negocios distintos.
      setBusinessSlug: (slug) => {
        if (get().businessSlug !== slug) {
          set({ businessSlug: slug, items: [] });
        }
      },

      addItem: (item, quantity = 1) => {
        set((state) => {
          const existing = state.items.find((i) => i.productId === item.productId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === item.productId ? { ...i, quantity: i.quantity + quantity } : i,
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity }] };
        });
      },

      removeItem: (productId) =>
        set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),

      incrementItem: (productId) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i,
          ),
        })),

      decrementItem: (productId) =>
        set((state) => {
          const existing = state.items.find((i) => i.productId === productId);
          if (existing && existing.quantity <= 1) {
            return { items: state.items.filter((i) => i.productId !== productId) };
          }
          return {
            items: state.items.map((i) =>
              i.productId === productId ? { ...i, quantity: i.quantity - 1 } : i,
            ),
          };
        }),

      clearCart: () => set({ items: [] }),
    }),
    {
      name: 'wa-catalog-cart',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ businessSlug: state.businessSlug, items: state.items }),
    },
  ),
);
