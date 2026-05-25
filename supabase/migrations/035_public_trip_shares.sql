-- 035: Compartilhamento público de viagens via token
--
-- Cria infraestrutura pra gerar links públicos read-only de uma viagem.
-- O dono da viagem (ou owner+admin) pode gerar um token; quem tem o link
-- consegue ler dados da viagem mesmo não logado.
--
-- Privacidade:
-- - Cada link pode ter expiração opcional (expires_at)
-- - Despesas e tarefas NÃO são compartilhadas por padrão (incluídas em settings)
-- - Pode ser revogado a qualquer momento (revoked_at)
-- - Contador de views ajuda dono entender uso
--
-- Como funciona o fluxo de leitura:
-- 1. App gera token via INSERT (RLS permite owner/editor da viagem)
-- 2. Link compartilhado: https://trajet.app/p/<token>
-- 3. Cliente público chama Edge Function `public-trip` com o token
-- 4. Edge Function usa service_role pra ler a viagem (bypassa RLS) mas
--    valida que o token está válido e não expirado/revogado
-- 5. Retorna JSON com os dados (respeitando flags em settings)

create table if not exists public.public_trip_shares (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  token text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  /**
   * Configurações do que mostrar na view pública.
   * Defaults: itinerário e hospedagens SIM, despesas/tarefas NÃO.
   */
  include_lodgings boolean not null default true,
  include_expenses boolean not null default false,
  include_tasks boolean not null default false,
  /** Contador incrementado a cada GET (analytics) */
  views integer not null default 0
);

create index if not exists idx_public_trip_shares_trip_id
  on public.public_trip_shares (trip_id);

create index if not exists idx_public_trip_shares_token
  on public.public_trip_shares (token)
  where revoked_at is null;

-- ----- RLS -----
alter table public.public_trip_shares enable row level security;

-- SELECT: dono da viagem ou editor (mesma regra de visibilidade da própria viagem)
create policy "public_trip_shares_select" on public.public_trip_shares
  for select to authenticated
  using (
    trip_id in (
      select id from public.trips where owner_id = (select auth.uid())
    )
    or trip_id in (
      select trip_id from public.trip_members
      where profile_id = (select auth.uid())
    )
  );

-- INSERT: só dono ou editor da viagem podem criar link
create policy "public_trip_shares_insert" on public.public_trip_shares
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      trip_id in (
        select id from public.trips where owner_id = (select auth.uid())
      )
      or trip_id in (
        select tm.trip_id from public.trip_members tm
        where tm.profile_id = (select auth.uid())
          and tm.role in ('owner', 'editor')
      )
    )
  );

-- UPDATE: dono ou criador podem editar/revogar
create policy "public_trip_shares_update" on public.public_trip_shares
  for update to authenticated
  using (
    created_by = (select auth.uid())
    or trip_id in (
      select id from public.trips where owner_id = (select auth.uid())
    )
  );

-- DELETE: dono ou criador
create policy "public_trip_shares_delete" on public.public_trip_shares
  for delete to authenticated
  using (
    created_by = (select auth.uid())
    or trip_id in (
      select id from public.trips where owner_id = (select auth.uid())
    )
  );

-- IMPORTANTE: anon NÃO tem nenhuma policy. Acesso público acontece via
-- Edge Function `public-trip` que usa service_role.
