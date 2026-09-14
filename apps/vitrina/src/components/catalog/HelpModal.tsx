'use client';

import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { getSupabasePublicClient } from '@/lib/supabase/public-client';
import type { Business } from '@/lib/types';

export function HelpModal({ business, onClose }: { business: Business; onClose: () => void }) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError('Ingresa tu nombre.');
      return;
    }
    if (message.trim().length < 3) {
      setError('Escribe tu mensaje.');
      return;
    }

    setError(null);
    setSending(true);
    try {
      const supabase = getSupabasePublicClient();
      const { error: insertError } = await supabase.from('support_messages').insert({
        business_id: business.id,
        customer_name: name.trim(),
        message: message.trim(),
      });
      if (insertError) throw new Error(insertError.message);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos enviar tu mensaje.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-900">¿Necesitas ayuda?</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5 text-neutral-400" />
          </button>
        </div>

        {sent ? (
          <div className="space-y-4 py-2 text-center">
            <p className="text-sm text-neutral-600">
              Mensaje enviado. {business.name} lo va a revisar y te va a contactar.
            </p>
            <a
              href={`https://wa.me/${business.phone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-700"
            >
              Escribir directo por WhatsApp
            </a>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white active:bg-emerald-700"
            >
              Listo
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Tu nombre</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Juan Pérez"
                autoFocus
                className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Mensaje</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tengo una pregunta sobre..."
                rows={3}
                className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
            </div>

            {error ? <p className="text-xs font-medium text-red-500">{error}</p> : null}

            <button
              type="submit"
              disabled={sending}
              className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-60 active:bg-emerald-700"
            >
              {sending ? 'Enviando...' : 'Enviar mensaje'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
