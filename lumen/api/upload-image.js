/**
 * LUMEN, /api/upload-image
 * Uploads a hero image to Supabase Storage and returns its public URL. The
 * admin calls this at publish time with the already-resized JPEG (base64),
 * so big binaries never touch the story data or git.
 *
 * Gated by PUBLISH_SECRET (same key as /api/publish). The Supabase SERVICE key
 * stays server-side, so the browser never sees it.
 *
 * Body: { slug: string, dataBase64: "data:image/jpeg;base64,..." | raw base64,
 *         contentType?: "image/jpeg" }
 * Returns: { ok: true, url: "https://.../storage/v1/object/public/hero-images/<slug>.jpg" }
 */

const sb = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(503).json({ error: 'Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY).' });
  }
  const PUBLISH_SECRET = process.env.PUBLISH_SECRET;
  if (!PUBLISH_SECRET) return res.status(503).json({ error: 'PUBLISH_SECRET not configured.' });
  if (req.headers['x-publish-secret'] !== PUBLISH_SECRET) {
    return res.status(401).json({ error: 'Unauthorized: missing or incorrect publish key.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : null;
  if (!body || typeof body.dataBase64 !== 'string') {
    return res.status(400).json({ error: 'Body must include dataBase64.' });
  }

  const m = body.dataBase64.match(/^data:image\/([a-z0-9+.\-]+);base64,([\s\S]*)$/i);
  const b64 = m ? m[2] : body.dataBase64;
  const ext = (m && m[1].toLowerCase().indexOf('png') > -1) ? 'png' : 'jpg';
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

  let buffer;
  try { buffer = Buffer.from(b64, 'base64'); }
  catch (e) { return res.status(400).json({ error: 'dataBase64 is not valid base64.' }); }
  if (!buffer.length) return res.status(400).json({ error: 'Empty image.' });
  if (buffer.length > 6 * 1024 * 1024) {
    return res.status(413).json({ error: 'Image too large after resize (' + Math.round(buffer.length / 1024) + ' KB). Re-export smaller.' });
  }

  const slug = sb.cleanSlug(body.slug || 'hero') || 'hero';
  const filename = slug + '-' + Date.now().toString(36) + '.' + ext;

  try {
    const url = await sb.uploadHeroImage(filename, buffer, contentType);
    return res.status(200).json({ ok: true, url: url });
  } catch (err) {
    return res.status(502).json({ error: 'Upload failed: ' + err.message });
  }
};
