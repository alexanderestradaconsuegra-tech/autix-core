'use client';

import { useState } from 'react';
import { startLicenseCheckout } from '@/lib/licenseCheckout';
import type { OwnedBusiness } from '@/lib/supabase/admin';

export function PaywallScreen({ business, onSignOut }: { business: OwnedBusiness; onSignOut: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setError(null);
    setLoading(true);
    try {
      const url = await startLicenseCheckout(business.id);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos iniciar el pago.');
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-50 px-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">🔒</div>
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Tu prueba terminó</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Activa tu licencia de Vitrina para seguir usando el catálogo y el panel de {business.name}.
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200 p-4">
          <p className="text-3xl font-bold text-neutral-900">$7 USD</p>
          <p className="text-xs text-neutral-500">Pago único · licencia de por vida</p>
        </div>

        {error ? <p className="text-xs font-medium text-red-500">{error}</p> : null}

        <button
          type="button"
          onClick={() => void handleCheckout()}
          disabled={loading}
          className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? 'Redirigiendo...' : 'Activar mi licencia'}
        </button>
        <button type="button" onClick={onSignOut} className="w-full text-center text-xs font-medium text-neutral-500">
          Cerrar sesión
        </button>
      </div>
    </main>
  );
}
