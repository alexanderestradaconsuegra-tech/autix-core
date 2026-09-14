import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLicenseCheckout } from '@/lib/lemonsqueezy';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.getUser(token);
  return !error && data.user ? data.user.id : null;
}

interface BusinessOwnerRow {
  id: string;
  owner_id: string;
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de solicitud inválido.' }, { status: 400 });
  }

  const businessId = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).businessId : undefined;
  if (typeof businessId !== 'string') {
    return NextResponse.json({ error: 'Falta businessId.' }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data: business, error } = await supabase
    .from('businesses')
    .select('id, owner_id')
    .eq('id', businessId)
    .maybeSingle()
    .returns<BusinessOwnerRow>();

  // Solo el dueño del negocio puede iniciar el pago de SU licencia.
  if (error || !business || business.owner_id !== userId) {
    return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });
  }

  try {
    const checkoutUrl = await createLicenseCheckout({ businessId });
    return NextResponse.json({ url: checkoutUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No pudimos iniciar el pago.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
