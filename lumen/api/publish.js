/**
 * LUMEN, /api/publish  (Supabase edition)
 * Publishes a single story by upserting one row into the Supabase `stories`
 * table. Images are already hosted (the admin uploads them to Storage and
 * sends a URL), so the payload is tiny, no more 3.8 MB commits, no GitHub.
 *
 * The story is live immediately: list pages read it from Supabase and the
 * dynamic /story/[slug] fallback renders it. The nightly build then bakes a
 * permanent static page for it.
 *
 * Security model (unchanged from before):
 *   - The Supabase SERVICE key lives ONLY in a server-side env var. It never
 *     reaches the browser.
 *   - PUBLISH_SECRET gates the endpoint. The editor enters it at publish time
 *     and sends it in the `x-publish-secret` header.
 *
 * Required environment variables (Vercel dashboard, never here):
 *   SUPABASE_URL          https://<project>.supabase.co
 *   SUPABASE_SERVICE_KEY  service_role key (writes, bypasses RLS)
 *   PUBLISH_SECRET        long random string; must match what the editor types
 */

const sb = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const PUBLISH_SECRET = process.env.PUBLISH_SECRET;
  const missing = [];
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_KEY');
  if (!PUBLISH_SECRET) missing.push('PUBLISH_SECRET');
  if (missing.length) {
    return res.status(503).json({ error: 'Server not configured: missing ' + missing.join(', ') });
  }

  /* shared-secret gate, reject before doing any work */
  const provided = req.headers['x-publish-secret'];
  if (!provided || provided !== PUBLISH_SECRET) {
    return res.status(401).json({ error: 'Unauthorized: missing or incorrect publish key.' });
  }

  /* ---- validate payload ---- */
  const body = req.body && typeof req.body === 'object' ? req.body : null;
  if (!body) return res.status(400).json({ error: 'Body must be JSON.' });

  /* Accept either a single story {story:{...}} or the legacy {stories:[...]}
     array (publish them all). New admin sends one story. */
  const stories = Array.isArray(body.stories) ? body.stories
    : (body.story ? [body.story] : null);
  if (!Array.isArray(stories) || !stories.length) {
    return res.status(400).json({ error: 'Payload must include a "story" object or non-empty "stories" array.' });
  }

  const problems = [];
  stories.forEach((s, i) => {
    if (!s || typeof s !== 'object') { problems.push('#' + i + ' is not an object'); return; }
    ['slug', 'headline', 'lede'].forEach((k) => {
      if (typeof s[k] !== 'string' || !s[k].trim()) problems.push('#' + i + ' missing ' + k);
    });
    if (typeof s.heroImage === 'string' && s.heroImage.indexOf('data:') === 0) {
      problems.push('#' + i + ' heroImage is a base64 data URI; upload it to Storage and send the URL');
    }
    ['reviewedBy', 'verifiedDate'].forEach((k) => {
      if (s[k] != null && typeof s[k] !== 'string') problems.push('#' + i + ' ' + k + ' must be a string or null');
    });
  });
  if (problems.length) {
    return res.status(400).json({ error: 'Invalid stories: ' + problems.slice(0, 12).join('; ') });
  }

  /* ---- upsert each story; optionally replace corrections ---- */
  try {
    const slugs = [];
    for (const s of stories) {
      await sb.upsertStory(s);
      slugs.push(sb.cleanSlug(s.slug));
    }
    if (Array.isArray(body.corrections)) {
      await sb.replaceCorrections(body.corrections);
    }

    return res.status(200).json({
      ok: true,
      published: slugs,
      url: '/story/' + slugs[0],
      message: slugs.length + (slugs.length === 1 ? ' story is' : ' stories are') +
        ' live now. The nightly build will bake static pages for SEO.'
    });
  } catch (err) {
    return res.status(502).json({ error: 'Publish failed: ' + err.message });
  }
};
