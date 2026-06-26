/**
 * LUMEN, /api/story dynamic fallback
 * Renders a single article page from Supabase using the SAME renderer as the
 * nightly static bake (lib/story-render.js), so a story published moments ago
 * has full HTML + JSON-LD for crawlers before build.js writes its static file.
 *
 * How it is reached: vercel.json rewrites /story/:slug -> /api/story?slug=:slug
 * ONLY as a fallback. Vercel serves the real /story/<slug>/index.html first
 * when it exists (after the nightly bake), so this function runs just for
 * not-yet-baked stories.
 *
 * Env: SUPABASE_URL + SUPABASE_ANON_KEY.
 */

const sb = require('../lib/supabase');
const R = require('../lib/story-render');

module.exports = async function handler(req, res) {
  const slug = sb.cleanSlug((req.query && req.query.slug) || '');
  if (!slug) { res.status(404); return sendNotFound(res, ''); }

  if (!sb.isConfigured()) {
    res.status(503).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<!doctype html><meta charset=utf-8><title>Lumen</title><p>Story service unavailable.</p>');
  }

  try {
    const [story, all] = await Promise.all([
      sb.getStoryBySlug(slug),
      sb.getPublishedStories()
    ]);
    if (!story) { res.status(404); return sendNotFound(res, slug); }

    // hero is already a URL in Supabase, so the default heroOf (s.heroImage) is right
    const html = R.storyHTML(story, all);
    // short edge cache; the static bake will supersede this page tonight
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (err) {
    res.status(502).setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<!doctype html><meta charset=utf-8><title>Lumen</title><p>Could not load this story.</p>');
  }
};

function sendNotFound(res, slug) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.end('<!doctype html><meta charset=utf-8><title>Not found · Lumen</title>' +
    '<p>No published story at <code>/story/' + R.esc(slug) + '</code>.</p><p><a href="/">← Home</a></p>');
}
