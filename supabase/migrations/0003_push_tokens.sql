create table if not exists public.push_tokens (
  token text primary key,
  platform text not null default 'web',
  username text,
  updated_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

create policy "authenticated_full_access" on public.push_tokens
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
