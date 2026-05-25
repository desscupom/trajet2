import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

type RealtimeOptions = {
  table: string;
  filter?: string;
  onChange: (payload: {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: Record<string, unknown>;
    old: Record<string, unknown>;
  }) => void;
  enabled?: boolean;
};

// Contador global pra IDs únicos de canal (evita conflito entre instâncias).
let channelCounter = 0;

/**
 * Subscreve a mudanças em uma tabela via Supabase Realtime.
 *
 * Robustez contra:
 * - Múltiplas instâncias do hook com mesmos (table, filter) — cada uma tem
 *   seu próprio canal com nome único.
 * - React StrictMode (dev) — cleanup imediato e síncrono na desmontagem.
 * - Callback recriado a cada render — guardado em ref, sem re-subscribe.
 */
export function useRealtimeTable({
  table,
  filter,
  onChange,
  enabled = true,
}: RealtimeOptions) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled) return;

    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    // Cria o canal de forma assíncrona pra ter certeza que está separado
    // de qualquer cleanup anterior do StrictMode.
    const channelId = ++channelCounter;
    const channelName = `rt-${table}-${channelId}`;

    try {
      channel = supabase.channel(channelName);

      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          ...(filter ? { filter } : {}),
        },
        (payload: {
          eventType: 'INSERT' | 'UPDATE' | 'DELETE';
          new: Record<string, unknown>;
          old: Record<string, unknown>;
        }) => {
          if (cancelled) return;
          onChangeRef.current(payload);
        }
      );

      channel.subscribe((status) => {
        // CHANNEL_ERROR / TIMED_OUT são normais no Expo Go (sem WebSocket real).
        // Não logamos como erro para não spammar o console.
        if (__DEV__ && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          // silêncio em dev — é só o Expo Go sem suporte a Realtime completo
        }
      });
    } catch (err) {
      // Algum erro raro de cliente (ex: hot reload reaproveitando estado)
      console.warn(`[realtime] erro ao subscribir ${channelName}:`, err);
    }

    return () => {
      cancelled = true;
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          // ignora erros de cleanup
        }
      }
    };
  }, [table, filter, enabled]);
}
