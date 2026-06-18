/**
 * LUMEN — /api/claude
 * Serverless proxy for the admin "Check with AI" editorial filter.
 *
 * Works automatically on Vercel (and on Netlify if moved to
 * netlify/functions with a small wrapper). The Anthropic API key is
 * read from an environment variable and never reaches the browser.
 *
 * Setup (Vercel):
 *   1. Get an API key at https://console.anthropic.com
 *   2. Vercel project → Settings → Environment Variables:
 *        ANTHROPIC_API_KEY = sk-ant-...
 *   3. Redeploy. The admin's "Check with AI" button now works.
 *
 * Until this is configured, the admin shows
 * "AI check unavailable, proceed manually" — by design.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured' });
  }

  const { system, content } = req.body || {};
  if (!system || !content || typeof content !== 'string' || content.length > 20000) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        temperature: 0,
        system,
        messages: [{ role: 'user', content }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(502).json({ error: 'Anthropic API error', detail: data });
    }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Upstream request failed' });
  }
}
