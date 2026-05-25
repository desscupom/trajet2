-- 044: Galeria de roteiros gerados por IA + cache de reaproveitamento
--
-- Aplicar manualmente no SQL Editor do Supabase Dashboard:
-- https://supabase.com/dashboard/project/sakwdwdqsswblwqjtqth/sql

create table if not exists public.itinerary_templates (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  cache_key text not null,
  destination text not null,
  days_count int not null check (days_count between 1 and 30),
  style text,
  pace text,
  notes text,
  data jsonb not null,
  is_public boolean not null default false,
  reuse_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_itinerary_templates_cache
  on public.itinerary_templates (cache_key);

create index if not exists idx_itinerary_templates_gallery
  on public.itinerary_templates (is_public, created_at desc)
  where is_public = true;

create index if not exists idx_itinerary_templates_user
  on public.itinerary_templates (created_by, created_at desc);

create or replace function public._itinerary_templates_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_itinerary_templates_updated_at on public.itinerary_templates;
create trigger trg_itinerary_templates_updated_at
  before update on public.itinerary_templates
  for each row execute function public._itinerary_templates_set_updated_at();

alter table public.itinerary_templates enable row level security;

create policy "itinerary_templates_select" on public.itinerary_templates
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or is_public = true
  );

create policy "itinerary_templates_insert" on public.itinerary_templates
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "itinerary_templates_update" on public.itinerary_templates
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "itinerary_templates_delete" on public.itinerary_templates
  for delete to authenticated
  using (created_by = (select auth.uid()));

grant insert, update, delete on public.itinerary_templates to authenticated;

create or replace function public.bump_template_reuse(_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.itinerary_templates
  set reuse_count = reuse_count + 1
  where id = _template_id
    and (
      is_public = true
      or created_by = (select auth.uid())
    );
end;
$$;

revoke execute on function public.bump_template_reuse(uuid) from public;
grant execute on function public.bump_template_reuse(uuid) to authenticated;
