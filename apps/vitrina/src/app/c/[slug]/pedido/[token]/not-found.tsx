import Link from 'next/link';

export default function OrderNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-neutral-50 px-6 text-center">
      <h1 className="text-lg font-semibold text-neutral-900">Pedido no encontrado</h1>
      <p className="max-w-xs text-sm text-neutral-500">
        Este link de seguimiento no es válido. Revisa el mensaje de WhatsApp donde lo recibiste.
      </p>
      <Link href="/" className="mt-2 text-sm font-medium text-emerald-600">
        Volver al inicio
      </Link>
    </main>
  );
}
