'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export async function startLicenseCheckout(businessId: string): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('Tu sesión expiró, vuelve a iniciar sesión.');
  }

  const response = await fetch('/api/checkout/license', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ businessId }),
  });

  const result = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !result.url) {
    throw new Error(result.error ?? 'No pudimos iniciar el pago.');
  }
  return result.url;
}
