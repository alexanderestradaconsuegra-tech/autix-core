import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vitrina',
  description:
    'Catálogos web mobile-first con carrito que envía pedidos directo a WhatsApp, cobro con Mercado Pago y seguimiento de entrega.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
