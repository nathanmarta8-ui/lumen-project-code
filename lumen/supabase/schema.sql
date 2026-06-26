-- ============================================================
-- LUMEN, Supabase schema
-- Paste this into the Supabase SQL editor (Dashboard -> SQL -> New query)
-- and run once. Safe to re-run: every statement is idempotent.
--
-- Data model (hybrid, deliberately simple):
--   * The FULL story object lives in stories.data (jsonb) so all ~30 fields
--     are preserved without 30 typed columns to keep in sync with the admin.
--   * A few columns are duplicated OUT of the jsonb (slug, status,
--     publish_date, category) purely so the read API can filter/sort/index
--     efficiently. lib/supabase.js keeps these in step on every write.
-- ============================================================

-- ---- stories ------------------------------------------------
create table if not exists public.stories (
  slug         text primary key,
  status       text not null default 'published',   -- 'draft' | 'published'
  category     text,
  publish_date timestamptz not null default now(),
  data         jsonb not null,                       -- the whole story object
  updated_at   timestamptz not null default now()
);

create index if not exists stories_published_idx
  on public.stories (status, publish_date desc);
create index if not exists stories_category_idx
  on public.stories (category);

-- ---- corrections --------------------------------------------
create table if not exists public.corrections (
  id         bigint generated always as identity primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

-- ---- row level security -------------------------------------
-- Public (anon key) may READ published stories only. NOBODY may write
-- through the anon/authenticated keys: all writes go through the service
-- role key (server-side, in /api/publish), which bypasses RLS entirely.
alter table public.stories     enable row level security;
alter table public.corrections enable row level security;

drop policy if exists "public read published stories" on public.stories;
create policy "public read published stories"
  on public.stories for select
  using (status = 'published');

drop policy if exists "public read corrections" on public.corrections;
create policy "public read corrections"
  on public.corrections for select
  using (true);

-- ---- storage bucket for hero images -------------------------
-- Public-read bucket. Uploads happen server-side / via the admin using the
-- service role, so no insert policy is granted to anon.
insert into storage.buckets (id, name, public)
values ('hero-images', 'hero-images', true)
on conflict (id) do update set public = true;

drop policy if exists "public read hero images" on storage.objects;
create policy "public read hero images"
  on storage.objects for select
  using (bucket_id = 'hero-images');
