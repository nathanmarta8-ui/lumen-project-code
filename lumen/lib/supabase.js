/* ============================================================
   LUMEN, server-side Supabase helpers
   Shared by api/publish.js, api/stories.js, api/story/[slug].js, build.js
   and scripts/migrate-to-supabase.js. Uses the REST endpoints directly
   (no SDK dependency needed) so it runs the same on Vercel functions and
   in a plain `node` build step.

   Env vars (server-side only, set in Vercel -> Settings -> Env Vars):
     SUPABASE_URL          https://<project>.supabase.co
     SUPABASE_SERVICE_KEY  service_role key  -> writes, bypasses RLS
     SUPABASE_ANON_KEY     anon key          -> public reads via RLS
   ============================================================ */
'use strict';

const URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const BUCKET = 'hero-images';

function isConfigured() { return !!(URL && (SERVICE_KEY || ANON_KEY)); }

function cleanSlug(s) {
  return String(s == null ? '' : s).split('?')[0].split('#')[0]
    .split('/').filter(Boolean).pop() || '';
}

/* A story object -> the row we persist. The full object goes in `data`;
   the rest are denormalised columns the read API filters/sorts on. */
function storyToRow(story) {
  return {
    slug: cleanSlug(story.slug),
    status: story.status === 'draft' ? 'draft' : 'published',
    category: story.category || null,
    publish_date: story.publishDate || new Date().toISOString(),
    data: story,
    updated_at: new Date().toISOString()
  };
}

/* A row -> the story object the site renders (exactly what the admin saved). */
function rowToStory(row) {
  const s = (row && row.data) ? row.data : {};
  // keep the canonical columns authoritative in case data drifted
  if (row && row.publish_date && !s.publishDate) s.publishDate = row.publish_date;
  return s;
}

function rest(path, { method = 'GET', key = SERVICE_KEY, body, headers } = {}) {
  if (!URL) return Promise.reject(new Error('SUPABASE_URL is not set'));
  if (!key) return Promise.reject(new Error('Supabase key is not set'));
  return fetch(URL.replace(/\/$/, '') + path, {
    method,
    headers: Object.assign({
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json'
    }, headers || {}),
    body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  });
}

/* ---- reads ---- */
async function getPublishedStories({ key = ANON_KEY || SERVICE_KEY } = {}) {
  const r = await rest('/rest/v1/stories?status=eq.published&select=data,publish_date&order=publish_date.desc', { key });
  if (!r.ok) throw new Error('Supabase read failed (' + r.status + '): ' + (await r.text()));
  return (await r.json()).map(rowToStory);
}

async function getStoryBySlug(slug, { key = ANON_KEY || SERVICE_KEY } = {}) {
  const r = await rest('/rest/v1/stories?slug=eq.' + encodeURIComponent(cleanSlug(slug)) +
    '&status=eq.published&select=data,publish_date&limit=1', { key });
  if (!r.ok) throw new Error('Supabase read failed (' + r.status + '): ' + (await r.text()));
  const rows = await r.json();
  return rows.length ? rowToStory(rows[0]) : null;
}

async function getCorrections({ key = ANON_KEY || SERVICE_KEY } = {}) {
  const r = await rest('/rest/v1/corrections?select=data&order=created_at.desc', { key });
  if (!r.ok) return [];
  return (await r.json()).map(x => x.data);
}

/* ---- writes (service role only) ---- */
async function upsertStory(story) {
  const row = storyToRow(story);
  const r = await rest('/rest/v1/stories?on_conflict=slug', {
    method: 'POST',
    key: SERVICE_KEY,
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: [row]
  });
  if (!r.ok) throw new Error('Supabase upsert failed (' + r.status + '): ' + (await r.text()));
  return (await r.json())[0];
}

async function replaceCorrections(corrections) {
  if (!Array.isArray(corrections)) return;
  await rest('/rest/v1/corrections?id=gte.0', { method: 'DELETE', key: SERVICE_KEY });
  if (!corrections.length) return;
  const r = await rest('/rest/v1/corrections', {
    method: 'POST', key: SERVICE_KEY,
    body: corrections.map(c => ({ data: c }))
  });
  if (!r.ok) throw new Error('Supabase corrections write failed (' + r.status + '): ' + (await r.text()));
}

/* ---- storage: upload a hero image, return its public URL ---- */
async function uploadHeroImage(pathInBucket, buffer, contentType) {
  const clean = String(pathInBucket).replace(/^\/+/, '');
  const r = await fetch(URL.replace(/\/$/, '') + '/storage/v1/object/' + BUCKET + '/' + clean, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + SERVICE_KEY,
      apikey: SERVICE_KEY,
      'Content-Type': contentType || 'image/jpeg',
      'x-upsert': 'true'
    },
    body: buffer
  });
  if (!r.ok) throw new Error('Supabase storage upload failed (' + r.status + '): ' + (await r.text()));
  return publicImageUrl(clean);
}

function publicImageUrl(pathInBucket) {
  return URL.replace(/\/$/, '') + '/storage/v1/object/public/' + BUCKET + '/' +
    String(pathInBucket).replace(/^\/+/, '');
}

module.exports = {
  isConfigured, cleanSlug, BUCKET,
  storyToRow, rowToStory,
  getPublishedStories, getStoryBySlug, getCorrections,
  upsertStory, replaceCorrections,
  uploadHeroImage, publicImageUrl
};
