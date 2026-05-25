/**
 * Envia push notifications para outros membros da viagem via Edge Function.
 */
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

async function callSendPush(profileIds: string[], title: string, body: string, data?: Record<string, string>) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token || !profileIds.length) return;
  await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ profile_ids: profileIds, title, body, data }),
  });
}

/** Envia push para uma lista específica de usuários (inclui o próprio usuário) */
export async function sendPushToUsers({
  profileIds,
  title,
  body,
  data,
}: {
  profileIds: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}) {
  try {
    await callSendPush(profileIds, title, body, data);
  } catch (err) {
    console.warn('[sendPush] erro:', err);
  }
}

export async function sendPushToTripMembers({
  tripId,
  excludeProfileId,
  title,
  body,
  data,
}: {
  tripId: string;
  excludeProfileId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}) {
  try {
    const [membersResult, ownerResult] = await Promise.all([
      supabase.from('trip_members').select('profile_id').eq('trip_id', tripId).neq('profile_id', excludeProfileId),
      supabase.from('trips').select('owner_id').eq('id', tripId).single(),
    ]);

    const memberIds = (membersResult.data ?? []).map((m: any) => m.profile_id);
    const ownerId = ownerResult.data?.owner_id;
    const targetIds = [...new Set([...memberIds, ...(ownerId && ownerId !== excludeProfileId ? [ownerId] : [])])];

    await callSendPush(targetIds, title, body, data);
  } catch (err) {
    console.warn('[sendPush] erro:', err);
  }
}

/** Envia push para um único usuário por profile_id. */
export async function sendPushToUser(
  profileId: string,
  payload: { title: string; body: string; data?: Record<string, string> }
) {
  return sendPushToUsers({ profileIds: [profileId], title: payload.title, body: payload.body, data: payload.data });
}
