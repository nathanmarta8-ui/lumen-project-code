/**
 * LUMEN, /api/stories  (read path for the live list surfaces)
 * Returns published stories (and corrections) as JSON, in the SAME shape the
 * site already expects: { stories: [...], corrections: [...] }. The homepage,
 * board and category pages fetch this so a story is visible the instant it is
 * published, before the nightly static bake runs.
 *
 * Cached at the edge: s-maxage=60 keeps it fast while staying near-fresh, and
 * stale-while-revalidate serves the old copy for a minute while refreshing.
 *
 * Env: SUPABASE_URL + SUPABASE_ANON_KEY (public reads via RLS).
 */

const sb = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!sb.isConfigured()) {
    return res.status(503).json({ error: 'Supabase not configured' });
  }
  try {
    const [stories, corrections] = await Promise.all([
      sb.getPublishedStories(),
      sb.getCorrections()
    ]);
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({ stories, corrections });
  } catch (err) {
    return res.status(502).json({ error: 'Read failed: ' + err.message });
  }
};
