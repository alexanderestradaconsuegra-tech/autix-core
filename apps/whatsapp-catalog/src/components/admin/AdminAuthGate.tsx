'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export function AdminAuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loadingSession) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-neutral-400">Cargando...</div>
    );
  }

  if (!session) {
    return <LoginForm />;
  }

  return <>{children(session)}</>;
}

function LoginForm() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    const supabase = getSupabaseBrowserClient();
    if (mode === 'sign-in') {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) setError(authError.message);
    } else {
      const { error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) {
        setError(authError.message);
      } else {
        setNotice('Cuenta creada. Revisa tu correo para confirmarla si tu proyecto de Supabase lo exige.');
      }
    }
    setSubmitting(false);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-50 px-6">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-sm space-y-3 rounded-2xl border border-neutral-200 bg-white p-6"
      >
        <h1 className="text-lg font-semibold text-neutral-900">
          {mode === 'sign-in' ? 'Ingresa a tu panel' : 'Crea tu cuenta'}
        </h1>

        <div>
          <label htmlFor="admin-email" className="mb-1 block text-xs font-medium text-neutral-600">
            Correo
          </label>
          <input
            id="admin-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tucorreo@negocio.com"
            className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label htmlFor="admin-password" className="mb-1 block text-xs font-medium text-neutral-600">
            Contraseña
          </label>
          <input
            id="admin-password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
          />
        </div>

        {error ? <p className="text-xs font-medium text-red-500">{error}</p> : null}
        {notice ? <p className="text-xs font-medium text-emerald-600">{notice}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? 'Espera...' : mode === 'sign-in' ? 'Ingresar' : 'Crear cuenta'}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
            setError(null);
            setNotice(null);
          }}
          className="w-full text-center text-xs font-medium text-neutral-500"
        >
          {mode === 'sign-in' ? '¿No tienes cuenta? Crea una' : '¿Ya tienes cuenta? Ingresa'}
        </button>
      </form>
    </main>
  );
}
