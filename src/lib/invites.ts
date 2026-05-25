import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';

// Gera um token aleatório seguro (não-adivinhável) usando getRandomBytesAsync.
// 24 bytes = 32 chars em base64url, suficiente pra ser único e não bruteforce-able.
export async function generateInviteToken(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(24);
  // Converte pra base64url (sem +, /, =)
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  // btoa existe no RN moderno e na web. Polyfill via base64-js seria alternativa.
  const base64 =
    typeof btoa !== 'undefined'
      ? btoa(binary)
      : // Fallback Node-style se preciso
        Buffer.from(binary, 'binary').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type CreateInviteInput = {
  tripId: string;
  role?: 'editor' | 'viewer';
  maxUses?: number | null;
  expiresInDays?: number | null;
};

export async function createInvite(
  input: CreateInviteInput,
  userId: string
): Promise<{ token: string | null; error: string | null }> {
  // Usa função do banco que reutiliza token existente em vez de criar novo
  const { data, error } = await (supabase as any).rpc('get_or_create_invite', {
    _trip_id: input.tripId,
    _created_by: userId,
    _role: input.role ?? 'editor',
  });

  if (error) return { token: null, error: error.message };
  return { token: data as string, error: null };
}

export type InvitePreview = {
  trip_id: string | null;
  trip_title: string | null;
  trip_description: string | null;
  start_date: string | null;
  end_date: string | null;
  inviter_name: string | null;
  role: string | null;
  is_valid: boolean;
  reason: string | null;
};

export async function fetchInvitePreview(
  token: string
): Promise<InvitePreview | null> {
  const { data, error } = await supabase.rpc('get_invite_preview', {
    _token: token,
  });

  if (error) {
    console.error('Erro ao buscar convite:', error);
    return null;
  }

  // RPC retorna array, pegamos o primeiro
  return (data?.[0] as InvitePreview) ?? null;
}

export async function acceptInvite(
  token: string
): Promise<{ tripId: string | null; success: boolean; reason: string | null }> {
  const { data, error } = await supabase.rpc('accept_trip_invite', {
    _token: token,
  });

  if (error) {
    return { tripId: null, success: false, reason: error.message };
  }

  const result = data?.[0];
  if (!result) {
    return { tripId: null, success: false, reason: 'unknown' };
  }

  return {
    tripId: result.trip_id ?? null,
    success: result.success,
    reason: result.reason,
  };
}

export function describeInviteError(reason: string | null): string {
  switch (reason) {
    case 'not_found':
      return 'Esse link de convite não existe.';
    case 'revoked':
      return 'Esse convite foi revogado.';
    case 'expired':
      return 'Esse convite expirou.';
    case 'max_uses_reached':
      return 'Esse convite já atingiu o limite de usos.';
    case 'not_authenticated':
      return 'Você precisa estar logado para aceitar.';
    default:
      return 'Não foi possível processar esse convite.';
  }
}

// Constrói a URL pública do convite (vai pro WhatsApp, etc.)
// Em dev usamos exp://, em prod virará https://app.trajet.com/invite/<token>
export function buildInviteUrl(token: string): string {
  // No web pegamos a origem atual
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/invite/${token}`;
  }
  // Mobile: deep link com o scheme do app definido no app.json (trajet://)
  return `https://trajet.com.br/invite/${token}`;
}
