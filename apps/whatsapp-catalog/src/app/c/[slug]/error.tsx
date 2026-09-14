'use client';

import { useEffect } from 'react';

export default function CatalogError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[catalog:error]', error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-neutral-50 px-6 text-center">
      <h1 className="text-lg font-semibold text-neutral-900">No pudimos cargar este catálogo</h1>
      <p className="max-w-xs text-sm text-neutral-500">
        Intenta de nuevo en unos segundos. Si el problema persiste, contacta al negocio.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white active:bg-emerald-700"
      >
        Reintentar
      </button>
    </main>
  );
}
