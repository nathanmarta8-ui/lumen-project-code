/**
 * LUMEN, /api/rebuild
 * Triggers a fresh Vercel deployment, which re-runs `node build.js` against
 * Supabase and bakes the static story pages + stories.min.js + sitemap. Called
 * by the nightly Vercel Cron (see vercel.json "crons"), and usable by hand.
 *
 * It does NOT build anything itself, serverless functions are read-only and
 * ephemeral; it just pokes a Vercel Deploy Hook URL, which kicks off a real
 * build in Vercel's CI where the filesystem is writable and the deploy ships.
 *
 * Setup:
 *   Vercel -> Settings -> Git -> Deploy Hooks -> create one for the prod branch.
 *   Put its URL in env var VERCEL_DEPLOY_HOOK_URL.
 *   (Optional) Set CRON_SECRET; Vercel Cron sends it as a Bearer token, and we
 *   reject any other caller so randoms can't spam rebuilds.
 */

module.exports = async function handler(req, res) {
  const hook = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!hook) return res.status(503).json({ error: 'VERCEL_DEPLOY_HOOK_URL not configured' });

  /* If CRON_SECRET is set, require it (Vercel Cron sends it automatically). */
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers['authorization'] || '';
    if (auth !== 'Bearer ' + secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const r = await fetch(hook, { method: 'POST' });
    if (!r.ok) return res.status(502).json({ error: 'Deploy hook failed: HTTP ' + r.status });
    return res.status(200).json({ ok: true, triggered: true, at: new Date().toISOString() });
  } catch (err) {
    return res.status(502).json({ error: 'Deploy hook request failed: ' + err.message });
  }
};
