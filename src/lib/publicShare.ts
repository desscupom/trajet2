import { supabase } from '@/lib/supabase';

/**
 * Lib para gerenciar links de compartilhamento público de viagens.
 *
 * Fluxo (no app autenticado):
 * - `createShare(tripId, settings)` → gera token + INSERT na tabela
 * - `listShares(tripId)` → lista todos os links da viagem
 * - `revokeShare(shareId)` → marca revoked_at
 * - `updateShareSettings(shareId, settings)` → muda flags
 *
 * Acesso público (sem auth):
 * - `fetchPublicTrip(token)` → GET na Edge Function
 *
 * Geração de token:
 * - 32 chars base64url (a partir de bytes random)
 * - Espaço de keys gigante (>10^48 combinações) — impossível de adivinhar
 */

export type ShareSettings = {
  includeLodgings: boolean;
  includeExpenses: boolean;
  includeTasks: boolean;
  /** Em dias (null = sem expiração) */
  expiresInDays?: number | null;
};

export type PublicTripShare = {
  id: string;
  trip_id: string;
  token: string;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  include_lodgings: boolean;
  include_expenses: boolean;
  include_tasks: boolean;
  views: number;
};

/**
 * Gera token aleatório de 32 chars base64url.
 * Usa expo-crypto pra ter randomness segura.
 */
async function generateToken(): Promise<string> {
  const Crypto = await import('expo-crypto');
  const bytes = await Crypto.getRandomBytesAsync(24); // 24 bytes → 32 chars base64
  // Converte para base64url (sem padding, sem + ou /)
  // RN não tem btoa nativo confiável; convertendo manualmente
  const base64 = bytesToBase64(bytes);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesToBase64(bytes: Uint8Array): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++];
    const b2 = i < bytes.length ? bytes[i++] : 0;
    const b3 = i < bytes.length ? bytes[i++] : 0;
    result +=
      chars[b1 >> 2] +
      chars[((b1 & 0x03) << 4) | (b2 >> 4)] +
      chars[((b2 & 0x0f) << 2) | (b3 >> 6)] +
      chars[b3 & 0x3f];
  }
  // Padding adjust
  const padding = bytes.length % 3;
  if (padding === 1) result = result.slice(0, -2) + '==';
  else if (padding === 2) result = result.slice(0, -1) + '=';
  return result;
}

/**
 * Cria um novo link público pra uma viagem.
 * Retorna o registro completo (incluindo token).
 */
export async function createShare(
  tripId: string,
  settings: ShareSettings,
): Promise<PublicTripShare> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error('Não autenticado');

  const token = await generateToken();
  const expiresAt = settings.expiresInDays
    ? new Date(
        Date.now() + settings.expiresInDays * 24 * 60 * 60 * 1000,
      ).toISOString()
    : null;

  const { data, error } = await supabase
    .from('public_trip_shares')
    .insert({
      trip_id: tripId,
      token,
      created_by: userData.user.id,
      expires_at: expiresAt,
      include_lodgings: settings.includeLodgings,
      include_expenses: settings.includeExpenses,
      include_tasks: settings.includeTasks,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Erro ao criar link');
  }
  return data as PublicTripShare;
}

/**
 * Lista todos os links de uma viagem (incluindo revogados/expirados).
 */
export async function listShares(tripId: string): Promise<PublicTripShare[]> {
  const { data, error } = await supabase
    .from('public_trip_shares')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as PublicTripShare[];
}

/**
 * Revoga um link (não deleta — mantém pra histórico).
 */
export async function revokeShare(shareId: string): Promise<void> {
  const { error } = await supabase
    .from('public_trip_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', shareId);
  if (error) throw new Error(error.message);
}

/**
 * Atualiza configurações de visibilidade.
 */
export async function updateShareSettings(
  shareId: string,
  settings: Partial<{
    include_lodgings: boolean;
    include_expenses: boolean;
    include_tasks: boolean;
  }>,
): Promise<void> {
  const { error } = await supabase
    .from('public_trip_shares')
    .update(settings)
    .eq('id', shareId);
  if (error) throw new Error(error.message);
}

/**
 * Status legível de um share.
 */
export function getShareStatus(
  share: PublicTripShare,
): 'active' | 'revoked' | 'expired' {
  if (share.revoked_at) return 'revoked';
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return 'expired';
  }
  return 'active';
}

/**
 * Constrói a URL completa do link público.
 *
 * Por enquanto aponta pra Edge Function direto (que retorna JSON).
 * O frontend deve usar uma rota tipo `/p/<token>` no app pra exibir
 * de forma amigável — a Edge Function só serve dados.
 */
/**
 * Constrói a URL pública do link compartilhado.
 *
 * Estratégia (em ordem de preferência):
 * 1. Se `EXPO_PUBLIC_PUBLIC_VIEWER_URL` está setado → usa essa URL
 *    (ex: "https://trajet.app/p" — universal link que abre no app via
 *    intentFilters Android / associatedDomains iOS)
 * 2. Sem essa URL configurada → usa scheme nativo `trajet://p/<token>`
 *    (abre no app instalado, mas não dá fallback web)
 *
 * Em DEV, o scheme `trajet://` funciona no Expo Go também (via prefix).
 */
export function buildPublicURL(token: string): string {
  const base = process.env.EXPO_PUBLIC_PUBLIC_VIEWER_URL;
  if (base) {
    // URL universal — preferido em produção
    return `${base.replace(/\/$/, '')}/${token}`;
  }
  // Fallback: scheme nativo (só abre no app instalado)
  return `trajet://p/${token}`;
}

// --- Tipo do payload da Edge Function ---
export type PublicTripPayload = {
  share: {
    includeLodgings: boolean;
    includeExpenses: boolean;
    includeTasks: boolean;
  };
  trip: {
    id: string;
    title: string;
    description: string | null;
    start_date: string | null;
    end_date: string | null;
    cover_image_url: string | null;
    base_currency: string | null;
  };
  days: Array<{
    id: string;
    day_date: string;
    position: number;
    notes: string | null;
  }>;
  items: Array<{
    id: string;
    trip_day_id: string;
    custom_title: string | null;
    start_time: string | null;
    duration_minutes: number | null;
    notes: string | null;
    position: number;
    place: {
      id: string;
      name: string;
      address: string | null;
      category: string | null;
      latitude: number | null;
      longitude: number | null;
    } | null;
  }>;
  lodgings: Array<any>;
  expenses: Array<any>;
  tasks: Array<any>;
};

/**
 * Busca dados públicos de uma viagem (sem auth necessária).
 * Usada pela tela pública / viewer externo.
 */
export async function fetchPublicTrip(
  token: string,
): Promise<PublicTripPayload> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Supabase não configurado');

  const res = await fetch(
    `${supabaseUrl}/functions/v1/public-trip?token=${encodeURIComponent(token)}`,
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error ?? `Erro ${res.status}`);
  }

  return res.json();
}
