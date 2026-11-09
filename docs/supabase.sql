-- Supabase → SQL Editor ga qoʻyib, "Run" bosing (bir marta).
create table if not exists public.bot_docs (
  kind       text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);

-- Jadvalni ochiq kalitdan (anon) yopib qoʻyadi: faqat bot (service/secret kalit) oʻqiy va yoza oladi.
alter table public.bot_docs enable row level security;
