# Lumen → Supabase (scaling publish)

Why: hero images were stored as base64 inside `data/stories.js`, pushing it to
3.8 MB and over GitHub's commit limit. Now images live in Supabase Storage and
stories live in a Postgres table; publishing writes one ~2 KB row instead of
re-committing a multi-MB file. Scales fine to 10+ posts/day.

## Architecture (hybrid)

- **Publish** → `/api/publish` upserts one row to Supabase (image already
  uploaded to Storage by `/api/upload-image`). Live immediately.
- **List pages** (home/board/category) → ship nightly-baked data, then
  `app.js` pulls `/api/stories` once and re-renders for freshness.
- **Article pages** → static files served first; for a story not yet baked,
  `/story/:slug` rewrites to `/api/story` which renders from Supabase using the
  **same** renderer (`lib/story-render.js`) as the build — no SEO regression.
- **Nightly cron** (`vercel.json` → `/api/rebuild` at 07:00 UTC) pokes a Vercel
  Deploy Hook → `build.js` re-bakes all static pages + `stories.min.js` from
  Supabase.

## One-time setup

1. Create a Supabase project. SQL editor → paste & run `supabase/schema.sql`
   (creates the `stories`/`corrections` tables, RLS, and the `hero-images`
   public bucket).
2. Vercel → Settings → Environment Variables:
   ```
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SERVICE_KEY=<service_role key>   # server-only, writes
   SUPABASE_ANON_KEY=<anon key>              # public reads via RLS
   PUBLISH_SECRET=<your existing publish key>
   VERCEL_DEPLOY_HOOK_URL=<Settings → Git → Deploy Hooks → create>
   CRON_SECRET=<any long random string>      # optional, protects /api/rebuild
   ```
   You can delete the old `GITHUB_TOKEN` / `GITHUB_REPO` / `GITHUB_BRANCH` —
   publishing no longer touches git.
3. Migrate existing content (locally, with the two SUPABASE vars exported):
   ```
   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run migrate
   ```
   Uploads the 20 base64 heroes to Storage and writes the rows.
4. Deploy. Verify the homepage, a baked story, and publishing a test story.

## Fallback safety

If the SUPABASE env vars are absent, `build.js` falls back to `data/stories.js`
and `/api/stories` returns 503 (the live refresh silently no-ops) — so the site
keeps working exactly as before until you finish the cutover.
