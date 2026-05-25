// supabase/functions/public-trip/index.ts
//
// Endpoint público que retorna dados de uma viagem dado um token de compartilhamento.
//
// Uso: GET /functions/v1/public-trip?token=<TOKEN>
//
// Sem auth — qualquer um com o token pode ler. O token foi gerado pelo dono
// da viagem e pode ter expiração / ser revogado.
//
// Internamente usa service_role pra bypassar RLS, mas valida token primeiro.
//
// Deploy:
//   supabase functions deploy public-trip --no-verify-jwt
//
// IMPORTANTE: `--no-verify-jwt` porque queremos acesso público SEM token Supabase.
// A autenticação é feita pelo TOKEN da tabela public_trip_shares.

// @ts-expect-error: Deno imports
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error: ESM imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'GET') {
    return jsonError(405, 'Método não permitido');
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token || token.length < 16) {
    return jsonError(400, 'Token inválido');
  }

  // @ts-expect-error: Deno.env
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  // @ts-expect-error: Deno.env — service role key (NÃO expor essa chave)
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('Supabase env vars missing');
    return jsonError(500, 'Servidor mal configurado');
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ----- 1. Valida token -----
  const { data: share, error: shareError } = await supabase
    .from('public_trip_shares')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (shareError) {
    console.error('Erro buscando share:', shareError);
    return jsonError(500, 'Erro ao validar link');
  }

  if (!share) {
    return jsonError(404, 'Link não encontrado');
  }

  if (share.revoked_at) {
    return jsonError(410, 'Link revogado pelo dono');
  }

  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return jsonError(410, 'Link expirado');
  }

  // ----- 2. Incrementa contador de views (best-effort) -----
  await supabase
    .from('public_trip_shares')
    .update({ views: share.views + 1 })
    .eq('id', share.id);

  // ----- 3. Busca dados da viagem -----
  const tripId = share.trip_id;

  const [
    tripRes,
    daysRes,
    itemsRes,
    lodgingsRes,
    expensesRes,
    tasksRes,
  ] = await Promise.all([
    supabase
      .from('trips')
      .select(
        'id, title, description, start_date, end_date, cover_image_url, base_currency',
      )
      .eq('id', tripId)
      .single(),

    supabase
      .from('trip_days')
      .select('id, day_date, position, notes')
      .eq('trip_id', tripId)
      .order('day_date'),

    supabase
      .from('itinerary_items')
      .select(
        'id, trip_day_id, custom_title, start_time, duration_minutes, notes, position, place:places(id, name, address, category, latitude, longitude)',
      ),

    share.include_lodgings
      ? supabase
          .from('lodgings')
          .select(
            'id, name, kind, address, latitude, longitude, check_in_at, check_out_at, reservation_code, cost_amount, cost_currency, notes',
          )
          .eq('trip_id', tripId)
      : Promise.resolve({ data: [], error: null }),

    share.include_expenses
      ? supabase
          .from('expenses')
          .select(
            'id, description, amount, currency, amount_in_base, expense_date, category',
          )
          .eq('trip_id', tripId)
      : Promise.resolve({ data: [], error: null }),

    share.include_tasks
      ? supabase
          .from('tasks')
          .select('id, title, done, due_date')
          .eq('trip_id', tripId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (tripRes.error || !tripRes.data) {
    return jsonError(404, 'Viagem não encontrada');
  }

  const dayIds = new Set((daysRes.data ?? []).map((d: any) => d.id));
  const items = (itemsRes.data ?? []).filter((i: any) =>
    dayIds.has(i.trip_day_id),
  );

  const payload = {
    share: {
      includeLodgings: share.include_lodgings,
      includeExpenses: share.include_expenses,
      includeTasks: share.include_tasks,
    },
    trip: tripRes.data,
    days: daysRes.data ?? [],
    items,
    lodgings: lodgingsRes.data ?? [],
    expenses: expensesRes.data ?? [],
    tasks: tasksRes.data ?? [],
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    },
  });
});

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
