create table if not exists public.kits (
  id bigint primary key,
  name text not null,
  club text not null,
  season text not null default 'Custom',
  price integer not null default 0,
  number text not null default '#',
  league text not null default 'Custom',
  gradient text,
  badge text,
  image text not null,
  color text not null default 'Custom',
  stock integer not null default 0,
  size_stock jsonb not null default '{"S":0,"M":0,"L":0,"XL":0}'::jsonb,
  back_image text,
  description text,
  is_custom boolean not null default false,
  is_private boolean not null default false,
  is_draft boolean not null default false,
  is_archived boolean not null default false,
  is_removed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kits enable row level security;

drop policy if exists "public can read live kits" on public.kits;
create policy "public can read live kits"
on public.kits
for select
using (true);
