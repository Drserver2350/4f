-- Felani4F — Supabase schema (run once in SQL Editor)
create table if not exists public.f4f_state (
  id          int primary key,
  core        jsonb not null default '{}'::jsonb,
  comments    jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

insert into public.f4f_state (id, core, comments)
values (1, '{}'::jsonb, '[]'::jsonb)
on conflict (id) do nothing;

alter table public.f4f_state enable row level security;

drop policy if exists "f4f read"  on public.f4f_state;
drop policy if exists "f4f write" on public.f4f_state;
drop policy if exists "f4f insert" on public.f4f_state;

create policy "f4f read"   on public.f4f_state for select using (true);
create policy "f4f write"  on public.f4f_state for update using (true) with check (true);
create policy "f4f insert" on public.f4f_state for insert with check (true);
