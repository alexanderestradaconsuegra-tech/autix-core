'use client';

import { useState } from 'react';
import { startLicenseCheckout } from '@/lib/licenseCheckout';
import { trialDaysLeft } from '@/lib/licensing';
import type { OwnedBusiness } from '@/lib/supabase/admin';

export function TrialBanner({ business }: { business: OwnedBusiness }) {
  const [loading, setLoading] = useState(false);
  const daysLeft = trialDaysLeft(business);

  async function handleCheckout() {
    setLoading(true);
    try {
      const url = await startLicenseCheckout(business.id);
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
      <p className="text-xs font-medium text-amber-800">
        {daysLeft > 0 ? `Te quedan ${daysLeft} días de prueba.` : 'Tu prueba termina hoy.'}
      </p>
      <button
        type="button"
        onClick={() => void handleCheckout()}
        disabled={loading}
        className="shrink-0 rounded-full bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
      >
        {loading ? 'Redirigiendo...' : 'Activar licencia'}
      </button>
    </div>
  );
}
