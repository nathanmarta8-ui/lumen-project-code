/* ============================================================
   LUMEN, one-time migration: stories.js  ->  Supabase
   Reads the current data/stories.js, uploads every base64 hero image to
   the hero-images Storage bucket, rewrites heroImage to its public URL,
   and upserts one row per story. Corrections are migrated too.

   Run AFTER applying supabase/schema.sql, with the service key in env:

     SUPABASE_URL=...  SUPABASE_SERVICE_KEY=...  node scripts/migrate-to-supabase.js

   Idempotent: re-running re-uploads images (x-upsert) and merge-upserts
   rows, so it is safe to run again if it fails partway.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sb = require('../lib/supabase');

const ROOT = path.join(__dirname, '..');

function loadData() {
  const code = fs.readFileSync(path.join(ROOT, 'data', 'stories.js'), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window.LUMEN_DATA || { stories: [], corrections: [] };
}

async function migrate() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY before running.');
    process.exit(1);
  }
  const data = loadData();
  const stories = (data.stories || []).filter(s => s && s.slug);
  console.log('Migrating ' + stories.length + ' stories...');

  let images = 0, rows = 0;
  for (const s of stories) {
    const slug = sb.cleanSlug(s.slug);
    const hero = s.heroImage || '';
    const m = hero.match(/^data:image\/([a-z0-9+.\-]+);base64,([\s\S]*)$/i);
    if (m) {
      const ext = m[1].toLowerCase().indexOf('png') > -1 ? 'png' : 'jpg';
      const buf = Buffer.from(m[2], 'base64');
      const url = await sb.uploadHeroImage(slug + '.' + ext, buf, 'image/' + (ext === 'png' ? 'png' : 'jpeg'));
      s.heroImage = url;          // swap base64 -> public URL before persisting
      images++;
      console.log('  image  ' + slug + ' -> ' + url + ' (' + Math.round(buf.length / 1024) + ' KB)');
    }
    await sb.upsertStory(s);
    rows++;
    console.log('  row    ' + slug + ' (' + (s.status === 'draft' ? 'draft' : 'published') + ')');
  }

  if (Array.isArray(data.corrections) && data.corrections.length) {
    await sb.replaceCorrections(data.corrections);
    console.log('Migrated ' + data.corrections.length + ' corrections.');
  }

  console.log('\nDone: ' + rows + ' stories, ' + images + ' images uploaded to Storage.');
  console.log('Verify in the Supabase dashboard, then deploy. stories.js is no longer the source of truth.');
}

migrate().catch(e => { console.error('\nMigration failed:', e.message); process.exit(1); });
