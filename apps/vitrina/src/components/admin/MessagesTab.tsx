'use client';

import { useEffect, useState } from 'react';
import { listSupportMessages, resolveSupportMessage, type AdminSupportMessage } from '@/lib/supabase/admin';
import type { Business } from '@/lib/types';

export function MessagesTab({ business }: { business: Business }) {
  const [messages, setMessages] = useState<AdminSupportMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listSupportMessages(business.id).then((rows) => {
      setMessages(rows);
      setLoading(false);
    });
  }, [business.id]);

  async function toggleResolved(message: AdminSupportMessage) {
    const resolved = !message.resolved;
    await resolveSupportMessage(message.id, resolved);
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, resolved } : m)));
  }

  if (loading) return <p className="py-8 text-center text-sm text-neutral-400">Cargando...</p>;
  if (messages.length === 0) {
    return <p className="py-8 text-center text-sm text-neutral-400">No hay mensajes de ayuda todavía.</p>;
  }

  return (
    <ul className="space-y-2">
      {messages.map((message) => (
        <li
          key={message.id}
          className={`rounded-xl border p-3 ${
            message.resolved ? 'border-neutral-200 bg-white opacity-60' : 'border-amber-200 bg-amber-50'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-900">{message.customerName}</p>
              <p className="text-xs text-neutral-400">{new Date(message.createdAt).toLocaleString('es-CO')}</p>
            </div>
            <button
              type="button"
              onClick={() => void toggleResolved(message)}
              className="shrink-0 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-600"
            >
              {message.resolved ? 'Reabrir' : 'Resolver'}
            </button>
          </div>
          <p className="mt-2 text-sm text-neutral-700">{message.message}</p>
        </li>
      ))}
    </ul>
  );
}
