import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltam EXPO_PUBLIC_SUPABASE_URL e/ou EXPO_PUBLIC_SUPABASE_ANON_KEY no .env'
  );
}

const storage = Platform.OS === 'web' ? undefined : AsyncStorage;

/**
 * Backoff para erros de rede no fetch do Supabase.
 *
 * O Supabase SDK faz retry imediato de /auth/v1/token?grant_type=refresh_token
 * quando a rede falha — no Expo Go isso gera um flood de erros no console.
 *
 * Esta implementação detecta falhas consecutivas e injeta um delay crescente
 * entre cada tentativa, sem bloquear o JS thread (usa setTimeout).
 */
const _nativeFetch = global.fetch;
let _networkFailures = 0;
let _backoffUntil = 0;

async function fetchWithBackoff(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const now = Date.now();
  
  // Se está em período de backoff, espera
  if (_backoffUntil > now) {
    await new Promise<void>(r => setTimeout(r, _backoffUntil - now));
  }

  try {
    const result = await _nativeFetch(input as any, init);
    // Sucesso → reseta backoff
    _networkFailures = 0;
    _backoffUntil = 0;
    return result;
  } catch (err: any) {
    const isNetworkError =
      err?.message?.includes('Network request failed') ||
      err?.message?.includes('Failed to fetch') ||
      err?.name === 'AbortError';

    if (isNetworkError) {
      _networkFailures = Math.min(_networkFailures + 1, 7);
      // Backoff exponencial: 2s, 4s, 8s, 16s, 32s, 60s, 60s
      const delay = Math.min(2_000 * Math.pow(2, _networkFailures - 1), 60_000);
      _backoffUntil = Date.now() + delay;
    }

    throw err;
  }
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
  realtime: {
    reconnectAfterMs: (tries: number) => Math.min(10_000 * Math.pow(2, tries - 1), 60_000),
    heartbeatIntervalMs: 40_000,
  },
  global: {
    fetch: fetchWithBackoff,
  },
});

// Helpers de tipagem para usar nas telas
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type Inserts<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type Updates<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

export type Trip = Tables<'trips'>;
export type TripMember = Tables<'trip_members'>;
export type Profile = Tables<'profiles'>;
