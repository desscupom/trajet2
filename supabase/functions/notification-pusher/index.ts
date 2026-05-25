// supabase/functions/notification-pusher/index.ts
//
// Edge Function disparada por Database Webhook quando uma notification
// é INSERT-ada. Busca push tokens do profile_id e dispara push remoto
// via Expo Push API.
//
// Como configurar:
// 1. Deploy:
//    supabase functions deploy notification-pusher
//
// 2. Criar Database Webhook no Supabase Dashboard:
//    - Settings > Webhooks > Create new webhook
//    - Name: notification-pusher
//    - Table: notifications
//    - Events: Insert
//    - Type: Supabase Edge Function
//    - Function: notification-pusher
//
// Payload do webhook: { type: 'INSERT', table: 'notifications', record: {...}, schema: 'public' }
//
// Idempotência:
// - Se a chamada falhar parcialmente (algumas push tokens deram erro), as outras
//   continuam funcionando. Não há retry automático — é melhor "best-effort"
//   do que correr risco de duplicar (1 INSERT → 2 push notifications na pior hora).
//
// Push remoto NÃO funciona se:
// - User está em Expo Go (push tokens registrados ali não funcionam fora)
// - Token expirou ou foi revogado pelo Apple/Google
// - Profile não tem push tokens registrados (user nunca deu permissão de push)

// @ts-expect-error: Deno imports
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error: ESM imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: {
    id: string;
    profile_id: string;
    type: string;
    title: string;
    body: string | null;
    data: Record<string, any> | null;
    read_at: string | null;
    created_at: string;
  };
  old_record?: any;
};

type ExpoPushMessage = {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

serve(async (req: Request) => {
  // Webhook chega via POST com JSON
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Só processa INSERT em notifications
  if (payload.type !== 'INSERT' || payload.table !== 'notifications') {
    return new Response(JSON.stringify({ skipped: 'not-an-insert' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const notif = payload.record;
  if (!notif?.profile_id) {
    return new Response('Missing profile_id', { status: 400 });
  }

  // @ts-expect-error: Deno.env
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  // @ts-expect-error: Deno.env
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('Supabase env vars missing');
    return new Response('Server misconfigured', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Busca push tokens do user
  const { data: tokens, error: tokensError } = await supabase
    .from('push_tokens')
    .select('token, platform')
    .eq('profile_id', notif.profile_id);

  if (tokensError) {
    console.error('Erro buscando tokens:', tokensError);
    return new Response('Error fetching tokens', { status: 500 });
  }

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ skipped: 'no-tokens' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Verifica preferências de notificação do user
  // Se notifications_enabled=false na tabela notification_preferences, pular.
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('notifications_enabled, expense_added, member_joined, trip_edits, task_due_reminder')
    .eq('profile_id', notif.profile_id)
    .maybeSingle();

  if (prefs && prefs.notifications_enabled === false) {
    return new Response(JSON.stringify({ skipped: 'user-disabled-all' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Filtragem granular por tipo
  if (prefs) {
    const skipByType = shouldSkipByType(notif.type, prefs);
    if (skipByType) {
      return new Response(JSON.stringify({ skipped: 'user-disabled-type' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // 3. Monta mensagens Expo Push
  const messages: ExpoPushMessage[] = tokens.map((t: any) => ({
    to: t.token,
    title: notif.title,
    body: notif.body ?? undefined,
    data: {
      ...(notif.data ?? {}),
      notification_id: notif.id,
      type: notif.type,
    },
    sound: 'default',
    // Android notification channel (default no app é "default")
    channelId: 'default',
  }));

  // 4. Envia em lote pra Expo Push API
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Expo Push error:', res.status, errText);
      return new Response(JSON.stringify({ error: 'expo-push-failed', status: res.status }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await res.json();

    // Limpa tokens que retornaram DeviceNotRegistered (token revogado)
    if (Array.isArray(result?.data)) {
      const deadTokens: string[] = [];
      result.data.forEach((r: any, idx: number) => {
        if (
          r?.status === 'error' &&
          (r?.details?.error === 'DeviceNotRegistered' ||
            r?.details?.error === 'InvalidCredentials')
        ) {
          deadTokens.push(tokens[idx].token);
        }
      });

      if (deadTokens.length > 0) {
        await supabase
          .from('push_tokens')
          .delete()
          .in('token', deadTokens);
      }
    }

    return new Response(
      JSON.stringify({
        sent: tokens.length,
        result: result.data,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (err: any) {
    console.error('Erro enviando push:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Decide se deve pular o push baseado nas preferências do user.
 * Retorna true = pula.
 */
function shouldSkipByType(
  notifType: string,
  prefs: {
    expense_added: boolean;
    member_joined: boolean;
    trip_edits: boolean;
    task_due_reminder: boolean;
  },
): boolean {
  switch (notifType) {
    case 'expense_added':
      return prefs.expense_added === false;
    case 'member_joined':
      return prefs.member_joined === false;
    case 'trip_edit':
      return prefs.trip_edits === false;
    case 'task_due':
      return prefs.task_due_reminder === false;
    default:
      return false;
  }
}
