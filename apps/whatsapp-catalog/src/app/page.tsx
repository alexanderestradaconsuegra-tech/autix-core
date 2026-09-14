import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-neutral-50 px-6 text-center">
      <h1 className="text-xl font-semibold text-neutral-900">WhatsApp Catalog Builder</h1>
      <p className="max-w-sm text-sm text-neutral-500">
        Convierte tu lista de productos en un catálogo web con carrito que arma el pedido y lo envía
        directo al WhatsApp de tu negocio.
      </p>
      <Link
        href="/admin"
        className="mt-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white active:bg-emerald-700"
      >
        Crear mi catálogo
      </Link>
    </main>
  );
}
