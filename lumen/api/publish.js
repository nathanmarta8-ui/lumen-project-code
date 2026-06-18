/**
 * LUMEN — /api/publish
 * Commits updated story data to the repo from the admin "Publish" button,
 * on a new branch, and opens a pull request against the base branch. The
 * site goes live only after that PR is merged — so a bad publish can never
 * take production down directly.
 *
 * Security model:
 *   - The GitHub token lives ONLY in a server-side env var. It is never sent
 *     to the browser and never written into any client file.
 *   - A shared secret (PUBLISH_SECRET) gates the endpoint so random visitors
 *     can't call it. The admin sends it in the `x-publish-secret` header; the
 *     editor enters it at publish time (it is NOT baked into admin.html).
 *
 * Required environment variables (set in the Vercel dashboard, never here):
 *   GITHUB_TOKEN   Fine-grained PAT with "Contents: Read and write" + "Pull
 *                  requests: Read and write" on this repo only. Nothing else.
 *   GITHUB_REPO    "owner/repo", e.g. "nathans/lumen".
 *   GITHUB_BRANCH  Base branch to open the PR against. Optional, default "main".
 *   PUBLISH_SECRET Any long random string. Must match the key the editor types
 *                  in the admin when publishing.
 *
 * Optional:
 *   VERCEL_PREVIEW_HOST  A template for the branch preview alias so the admin
 *                        can deep-link the preview, e.g.
 *                        "lumen-git-{branch}-myteam.vercel.app".
 *                        "{branch}" is replaced with the sanitized branch name.
 *                        If unset, the PR link is returned (Vercel posts the
 *                        preview there automatically).
 */

import { createContext, runInContext } from 'node:vm';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const BASE_BRANCH = process.env.GITHUB_BRANCH || 'main';
  const PUBLISH_SECRET = process.env.PUBLISH_SECRET;

  const missing = [];
  if (!GITHUB_TOKEN) missing.push('GITHUB_TOKEN');
  if (!GITHUB_REPO) missing.push('GITHUB_REPO');
  if (!PUBLISH_SECRET) missing.push('PUBLISH_SECRET');
  if (missing.length) {
    return res.status(503).json({ error: 'Server not configured: missing ' + missing.join(', ') });
  }

  /* shared-secret gate — reject before doing any work */
  const provided = req.headers['x-publish-secret'];
  if (!provided || provided !== PUBLISH_SECRET) {
    return res.status(401).json({ error: 'Unauthorized: missing or incorrect publish key.' });
  }

  /* ---- validate payload ---- */
  const body = req.body && typeof req.body === 'object' ? req.body : null;
  if (!body) {
    return res.status(400).json({ error: 'Body must be JSON.' });
  }
  const stories = body.stories;
  const corrections = Array.isArray(body.corrections) ? body.corrections : [];
  if (!Array.isArray(stories) || !stories.length) {
    return res.status(400).json({ error: 'Payload must include a non-empty "stories" array.' });
  }
  const problems = [];
  stories.forEach((s, i) => {
    if (!s || typeof s !== 'object') { problems.push('#' + i + ' is not an object'); return; }
    ['slug', 'headline', 'lede'].forEach((k) => {
      if (typeof s[k] !== 'string' || !s[k].trim()) problems.push('#' + i + ' missing ' + k);
    });
  });
  if (problems.length) {
    return res.status(400).json({ error: 'Invalid stories: ' + problems.slice(0, 12).join('; ') });
  }

  /* ---- build the file exactly as the site loads it (window.LUMEN_DATA) ---- */
  const fileContent =
    '/* LUMEN story data — committed by /api/publish on ' + new Date().toISOString() + '.\n' +
    '   Generated from the admin Publish button; do not hand-edit on main. */\n\n' +
    'window.LUMEN_DATA = ' + JSON.stringify({ stories, corrections }, null, 2) + ';\n';

  if (fileContent.length > 4000000) {
    return res.status(413).json({ error: 'Payload too large (' + Math.round(fileContent.length / 1024) + ' KB). Keep base64 hero images out of the data or host them as URLs.' });
  }

  /* ---- prove it is valid JS AND yields the same shape (never break the site) ---- */
  try {
    const sandbox = { window: {} };
    createContext(sandbox);
    runInContext(fileContent, sandbox, { timeout: 2000 });
    const out = sandbox.window.LUMEN_DATA;
    if (!out || !Array.isArray(out.stories) || out.stories.length !== stories.length) {
      return res.status(400).json({ error: 'Generated stories.js did not parse to the expected shape.' });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Generated stories.js is not valid JavaScript: ' + e.message });
  }

  /* ---- GitHub: new branch -> commit data/stories.js -> open PR ---- */
  const targetSlug =
    String(body.slug || stories[0].slug || 'story')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'story';
  const branch = 'publish/' + targetSlug + '-' + Date.now().toString(36);
  const api = 'https://api.github.com/repos/' + GITHUB_REPO;

  const gh = (path, opts = {}) =>
    fetch(api + path, {
      method: opts.method || 'GET',
      headers: {
        Authorization: 'Bearer ' + GITHUB_TOKEN,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'lumen-admin-publish',
        'Content-Type': 'application/json'
      },
      body: opts.body
    });
  /* pull GitHub's own message out of an error response so the admin can show it */
  const ghErr = async (r) => {
    let body = null;
    try { body = await r.json(); } catch (e) {}
    let msg = (body && body.message) || '';
    if (body && Array.isArray(body.errors) && body.errors.length) {
      msg += (msg ? ' — ' : '') + body.errors.map((e) => e.message || (e.field + ' ' + e.code)).join('; ');
    }
    return { status: r.status, message: msg || ('HTTP ' + r.status) };
  };

  try {
    /* 1. base branch head sha */
    let r = await gh('/git/ref/heads/' + encodeURIComponent(BASE_BRANCH));
    if (!r.ok) { const e = await ghErr(r); return res.status(502).json({ error: 'Cannot read base branch "' + BASE_BRANCH + '" (' + e.status + '): ' + e.message + '. Check GITHUB_REPO and that the token can read this repo.' }); }
    const baseSha = (await r.json()).object.sha;

    /* 2. create the publish branch */
    r = await gh('/git/refs', { method: 'POST', body: JSON.stringify({ ref: 'refs/heads/' + branch, sha: baseSha }) });
    if (!r.ok) { const e = await ghErr(r); return res.status(502).json({ error: 'Could not create branch ' + branch + ' (' + e.status + '): ' + e.message }); }

    /* 3. current file sha on the base branch (may not exist yet) */
    let fileSha;
    r = await gh('/contents/data/stories.js?ref=' + encodeURIComponent(BASE_BRANCH));
    if (r.ok) { fileSha = (await r.json()).sha; }

    /* 4. commit the new data/stories.js onto the publish branch */
    const commitMsg = 'Publish: ' + (stories[0].headline ? String(stories[0].headline).replace(/==/g, '').slice(0, 72) : targetSlug);
    const put = {
      message: commitMsg,
      content: Buffer.from(fileContent, 'utf8').toString('base64'),
      branch
    };
    if (fileSha) put.sha = fileSha;
    r = await gh('/contents/data/stories.js', { method: 'PUT', body: JSON.stringify(put) });
    if (!r.ok) { const e = await ghErr(r); return res.status(502).json({ error: 'Could not commit data/stories.js (' + e.status + '): ' + e.message }); }

    /* the branch + commit now exist; this URL opens a PR for them by hand */
    /* GitHub compare URLs keep the literal "/" in branch names, so don't encode it */
    const manualPrUrl = 'https://github.com/' + GITHUB_REPO + '/compare/' +
      BASE_BRANCH + '...' + branch + '?expand=1';

    /* 5. open the PR against the base branch */
    r = await gh('/pulls', {
      method: 'POST',
      body: JSON.stringify({
        title: commitMsg,
        head: branch,
        base: BASE_BRANCH,
        body: 'Automated publish from the Lumen admin.\n\n' +
          '- ' + stories.length + ' stories in `data/stories.js`\n' +
          '- Validated as parseable JavaScript before commit\n\n' +
          'Review the Vercel preview attached to this PR, then merge to go live.'
      })
    });
    if (!r.ok) {
      const e = await ghErr(r);
      const hint = e.status === 403
        ? ' — the GitHub token is missing "Pull requests: Read and write" permission. Add it to the fine-grained token, then open the PR with the link.'
        : ' — open the PR with the link below.';
      return res.status(502).json({
        error: 'Committed to ' + branch + ', but opening the PR failed (' + e.status + '): ' + e.message + hint,
        branch,
        manualPrUrl
      });
    }
    const pr = await r.json();

    return res.status(200).json({
      ok: true,
      prUrl: pr.html_url,
      branch,
      previewUrl: previewFor(branch)
    });
  } catch (err) {
    return res.status(502).json({ error: 'GitHub request failed: ' + err.message });
  }
}

/* Optional deep-link to the Vercel branch preview if a template is configured.
   Vercel always also posts the authoritative preview link on the PR itself. */
function previewFor(branch) {
  const tpl = process.env.VERCEL_PREVIEW_HOST;
  if (!tpl) return null;
  const alias = branch.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const host = tpl.replace(/^https?:\/\//, '').replace('{branch}', alias);
  return 'https://' + host;
}
