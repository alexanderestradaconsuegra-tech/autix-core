import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { geocodeAddress } from '@/lib/geocoding';

/**
 * Solo confirma que quien llama tiene una sesión de Supabase válida (evita
 * que cualquiera queme la cuota de la API key de Google pegándole directo
 * a este endpoint) — no verifica que sea dueño de un negocio en particular,
 * porque esta ruta no escribe nada, solo geocodifica una dirección.
 */
async function requireAuthenticatedCaller(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  if (!token) return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.getUser(token);
  return !error && !!data.user;
}

export async function POST(request: Request) {
  if (!(await requireAuthenticatedCaller(request))) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de solicitud inválido.' }, { status: 400 });
  }

  const address = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).address : undefined;
  if (typeof address !== 'string' || address.trim().length < 3) {
    return NextResponse.json({ error: 'Ingresa una dirección.' }, { status: 400 });
  }

  try {
    const result = await geocodeAddress(address.trim());
    if (!result) {
      return NextResponse.json({ error: 'No encontramos esa dirección en Google Maps.' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No pudimos geocodificar la dirección.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
