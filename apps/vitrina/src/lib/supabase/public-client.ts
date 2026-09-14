'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let publicClient: SupabaseClient | null = null;

/**
 * Cliente anon para acciones anónimas del catálogo público (insertar un
 * mensaje de ayuda). Sin sesión — no confundir con getSupabaseBrowserClient()
 * de /admin, que sí persiste el login del dueño.
 */
export function getSupabasePublicClient(): SupabaseClient {
  if (publicClient) return publicClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase no está configurado (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).');
  }

  publicClient = createClient(url, key, { auth: { persistSession: false } });
  return publicClient;
}
