-- 043: Lembretes baseados em localização (geofencing)
--
-- User define um raio em torno de um ponto. Quando o app detectar entrada
-- (ou saída) desse raio, cria uma notificação.
--
-- O matching acontece NO DEVICE (não no servidor):
--   - App registra geofences ativos via expo-location
--   - Quando OS detecta entrada/saída, callback do app cria notification
--   - Servidor só armazena os geofences (não tem tracking contínuo)
--
-- Por isso o cron não dispara isso — diferente de user_reminders.

create table if not exists public.geo_reminders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,

  title text not null,
  body text,

  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_m integer not null default 200 check (radius_m between 50 and 50000),

  place_name text,
  trip_id uuid references public.trips(id) on delete set null,

  trigger_on text not null default 'enter' check (trigger_on in ('enter', 'exit')),
  notified_at timestamptz,
  repeat boolean not null default false,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_geo_reminders_profile_active
  on public.geo_reminders (profile_id, active)
  where active = true;

create index if not exists idx_geo_reminders_trip
  on public.geo_reminders (trip_id)
  where trip_id is not null;

create or replace function public._geo_reminders_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_geo_reminders_updated_at on public.geo_reminders;
create trigger trg_geo_reminders_updated_at
  before update on public.geo_reminders
  for each row
  execute function public._geo_reminders_set_updated_at();

alter table public.geo_reminders enable row level security;

create policy "geo_reminders_self_select" on public.geo_reminders
  for select to authenticated
  using (profile_id = (select auth.uid()));

create policy "geo_reminders_self_insert" on public.geo_reminders
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

create policy "geo_reminders_self_update" on public.geo_reminders
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "geo_reminders_self_delete" on public.geo_reminders
  for delete to authenticated
  using (profile_id = (select auth.uid()));

grant insert, update, delete on public.geo_reminders to authenticated;
