// Edge function: send-push-on-activity
//
// Recebe um payload com info de atividade da viagem e dispara push
// via Expo Push API pros membros da viagem (exceto o autor).
//
// Como deployar:
//   supabase functions deploy send-push-on-activity --no-verify-jwt
//
// O --no-verify-jwt é necessário porque vamos chamar essa função via trigger
// no banco, que não tem JWT de user.
//
// Em produção real, vc deveria adicionar uma "service key" check
// pra evitar que qualquer um chame a função.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type Payload = {
  trip_id: string;
  actor_id: string; // quem fez a ação (não notifica ele)
  type: "trip_edits" | "expense_added" | "member_joined";
  title: string;
  body: string;
};

serve(async (req) => {
  // CORS pra preflight (caso seja chamada do client diretamente)
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type, authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { trip_id, actor_id, type, title, body } = payload;
  if (!trip_id || !actor_id || !type || !title || !body) {
    return new Response("Missing fields", { status: 400 });
  }

  // Cliente Supabase com service role (acesso total — não tem RLS)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  // 1. Pega membros da viagem (excluindo o autor)
  const { data: members, error: membersErr } = await sb
    .from("trip_members")
    .select("profile_id")
    .eq("trip_id", trip_id)
    .neq("profile_id", actor_id);

  if (membersErr || !members || members.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, reason: "no recipients" }),
      { headers: { "content-type": "application/json" } },
    );
  }

  const profileIds = members.map((m) => m.profile_id);

  // 2. Filtra só quem tem essa pref ativa + master ativo
  const { data: prefs } = await sb
    .from("notification_preferences")
    .select("profile_id, notifications_enabled, trip_edits, expense_added, member_joined")
    .in("profile_id", profileIds);

  const allowedIds = (prefs ?? [])
    .filter((p) => p.notifications_enabled && p[type])
    .map((p) => p.profile_id);

  if (allowedIds.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, reason: "no opted-in recipients" }),
      { headers: { "content-type": "application/json" } },
    );
  }

  // 3. Pega tokens de todos os devices desses profiles
  const { data: tokens } = await sb
    .from("push_tokens")
    .select("token")
    .in("profile_id", allowedIds);

  if (!tokens || tokens.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, reason: "no push tokens" }),
      { headers: { "content-type": "application/json" } },
    );
  }

  // 4. Monta as mensagens pro Expo Push API
  const messages = tokens.map((t) => ({
    to: t.token,
    sound: "default",
    title,
    body,
    data: { trip_id, type },
  }));

  // 5. Dispara em batch (Expo aceita até 100 por request)
  const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  const expoBody = await expoRes.json();

  return new Response(
    JSON.stringify({
      sent: messages.length,
      recipients: allowedIds.length,
      expo: expoBody,
    }),
    { headers: { "content-type": "application/json" } },
  );
});
