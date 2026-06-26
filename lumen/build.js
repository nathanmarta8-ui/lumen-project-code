/* ============================================================
   LUMEN, GEO pre-render build
   Reads data/stories.js and writes a real, fully-rendered HTML
   file per story at /story/{slug}/index.html with baked-in
   <title>, meta description, Open Graph, and Article +
   MedicalWebPage JSON-LD. Also regenerates sitemap.xml and
   writes llms.txt. Runs at deploy time on Vercel.
   No dependencies, Node core only.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* The per-story article template lives in lib/story-render.js, shared with the
   dynamic fallback (api/story/[slug].js) so a freshly published story renders
   identically before and after the nightly bake. */
const R = require('./lib/story-render');

const SITE = 'https://readlumen.site';
const AUTHOR = 'Nathan Stanley Martanegara';
const PUBLISHER = 'Lumen';
const ROOT = __dirname;

/* ---------- load story data ----------
   Source of truth is Supabase. When SUPABASE_URL/keys are set, pull published
   stories from there; otherwise fall back to the local data/stories.js so the
   build keeps working before the migration and in offline/dev checkouts. */
const SB = require('./lib/supabase');
function loadDataFromFile() {
  const code = fs.readFileSync(path.join(ROOT, 'data', 'stories.js'), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window.LUMEN_DATA || { stories: [], corrections: [] };
}
async function loadData() {
  if (SB.isConfigured()) {
    try {
      const [stories, corrections] = await Promise.all([
        SB.getPublishedStories(), SB.getCorrections()
      ]);
      console.log('[lumen build] data source: Supabase (' + stories.length + ' published stories)');
      return { stories, corrections };
    } catch (e) {
      console.warn('[lumen build] Supabase read failed (' + e.message + '), falling back to data/stories.js');
    }
  } else {
    console.log('[lumen build] data source: data/stories.js (Supabase not configured)');
  }
  return loadDataFromFile();
}

/* ---------- helpers (mirror app.js) ---------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function jsonEsc(s) { return String(s == null ? '' : s).replace(/</g, '\\u003c'); }
function plainHead(h) { return String(h || '').replace(/==/g, ''); }
function cleanSlug(s) {
  return String(s == null ? '' : s).split('?')[0].split('#')[0]
    .split('/').filter(Boolean).pop() || '';
}
function fmtISO(d) { try { return new Date(d).toISOString(); } catch (e) { return ''; } }
function fmtDate(d) {
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch (e) { return ''; }
}
function num(n) { return Number(n || 0).toLocaleString('en-US'); }

/* evidenceHTML, realityCheckHTML, cleanBody, absImg, missedBreakthroughs and
   asideStaticHTML now live in lib/story-render.js (single source of truth for
   the article page). Re-export here so the rest of build.js keeps working. */
const { cleanBody } = R;

const CAT_SLUGS = {
  'Medicine': 'medicine', 'Biotechnology': 'biotechnology', 'Health Tech': 'health-tech',
  'Brain Science': 'brain-science', 'Longevity': 'longevity', 'Global Health': 'global-health',
  'Mental Health': 'mental-health'
};
function realAuthor(s) { var a = (s.author || '').trim(); var low = a.toLowerCase(); return (!a || low.indexOf('lumen') === 0 || low.indexOf('nathan stanley') === 0) ? AUTHOR : a; }

/* ---------- hero image extraction (kill base64) ----------
   Decodes each story's base64 hero image to a real file at
   /assets/img/{slug}.{ext} once per build, returns the public path.
   Non-data URLs (or empty) pass through untouched. Results memoised in HERO. */
const IMG_DIR = path.join(ROOT, 'assets', 'img');
let HERO = {};        // slug -> public hero path (or original URL)
let DATA = { stories: [], corrections: [] };
function resolveHero(s) {
  const h = s.heroImage || '';
  if (h.indexOf('data:') !== 0) return h;                 // already a URL/path or empty
  const m = h.match(/^data:image\/([a-z0-9+.\-]+);base64,([\s\S]*)$/i);
  if (!m) return h;
  const ext = m[1].toLowerCase().indexOf('png') > -1 ? 'png' : 'jpg';
  const slug = cleanSlug(s.slug);
  const rel = '/assets/img/' + slug + '.' + ext;
  try {
    fs.mkdirSync(IMG_DIR, { recursive: true });
    fs.writeFileSync(path.join(IMG_DIR, slug + '.' + ext), Buffer.from(m[2], 'base64'));
  } catch (e) { console.warn('[lumen build] image write failed for ' + slug + ': ' + e.message); }
  return rel;
}
function hero(s) { return HERO[cleanSlug(s.slug)] || ''; }
const { absImg } = R;

/* slim data file the PUBLIC pages load instead of the 3 MB base64 stories.js.
   Same shape (window.LUMEN_DATA) but every base64 hero swapped for its file path. */
function buildMinData(stories) {
  const slim = stories.map(s => Object.assign({}, s, { heroImage: hero(s) }));
  const out = '/* AUTO-GENERATED by build.js, do not edit. Source of truth is data/stories.js.\n' +
    '   Hero images are extracted to /assets/img/ and referenced by path here so public\n' +
    '   pages stay lightweight. */\n' +
    'window.LUMEN_DATA = ' + JSON.stringify({ stories: slim, corrections: DATA.corrections || [] }) + ';\n';
  fs.writeFileSync(path.join(ROOT, 'data', 'stories.min.js'), out);
  return out.length;
}

/* ---------- per-story page ----------
   Delegates to the shared renderer; build.js injects its base64->/assets/img
   hero resolver so the bake decodes images to files, while the dynamic
   fallback passes the Supabase URL straight through. */
function storyHTML(s, all) {
  return R.storyHTML(s, all, { heroOf: hero });
}

/* ---------- homepage + category pre-render ---------- */
const CAT_NAME = Object.keys(CAT_SLUGS).reduce((m, name) => { m[CAT_SLUGS[name]] = name; return m; }, {});

/* a crawlable listing: each story as a real <article> with linked headline,
   lede, category, and evidence tag, present in raw HTML before JS runs */
function listingHTML(list) {
  if (!list.length) return '<p class="ssr-empty">No stories in this section yet.</p>';
  return '<div class="ssr-listing">' + list.map(s => {
    const u = '/story/' + cleanSlug(s.slug);
    const tag = [s.sourceType || 'Peer-reviewed', s.journal, s.patientN ? 'n=' + s.patientN : '']
      .filter(Boolean).map(esc).join(' &#183; ');
    return '<article class="ssr-card">' +
      '<span class="cat-label">' + esc(s.category) + (s.subCategory ? ' &#183; ' + esc(s.subCategory) : '') + '</span>' +
      '<h2><a href="' + u + '">' + esc(plainHead(s.headline)) + '</a></h2>' +
      '<p>' + esc(s.lede) + '</p>' +
      '<p class="ssr-tag">' + tag + ' &#183; ' + esc(fmtDate(s.publishDate)) + '</p>' +
      '</article>';
  }).join('\n') + '</div>';
}
function itemListLD(list, name, url) {
  return {
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    name: name, url: url, isPartOf: { '@type': 'WebSite', name: PUBLISHER, url: SITE },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: list.map((s, i) => ({
        '@type': 'ListItem', position: i + 1,
        url: SITE + '/story/' + cleanSlug(s.slug), name: plainHead(s.headline)
      }))
    }
  };
}
function sortedStories(stories) {
  return stories.slice().sort((a, b) => {
    const fb = (b.featured ? 2 : 0) + (b.breaking ? 1 : 0) - ((a.featured ? 2 : 0) + (a.breaking ? 1 : 0));
    return fb || (new Date(b.publishDate) - new Date(a.publishDate));
  });
}

/* lumenified WSJ front page, baked. KEEP IN SYNC with app.js renderHome:
   same partition (lead + 3 secondary + What's Verified rail + brief grid) and
   same markup so the prerender matches the client render and does not flash. */
function frontHTML(all) {
  const list = all.slice().sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
  // No published stories yet (e.g. fresh Supabase, or every story is a draft):
  // render an empty front rather than crashing the whole build/deploy.
  if (!list.length) return '<div class="container front"><p class="ssr-empty">No stories published yet.</p></div>';
  const lead = list.filter(s => s.featured)[0] || list[0];
  const rest = list.filter(s => s !== lead);
  const secondary = rest.slice(0, 3);
  const remaining = rest.slice(3);
  const hasEv = s => Number(s.patientN) > 0 || (s.trialPhase && s.trialPhase !== 'N/A');
  let rail = remaining.filter(hasEv).slice(0, 6);
  if (rail.length < 3) rail = remaining.slice(0, 6);
  const railSet = {}; rail.forEach(s => { railSet[cleanSlug(s.slug)] = 1; });
  const brief = remaining.filter(s => !railSet[cleanSlug(s.slug)]);
  const su = s => '/story/' + cleanSlug(s.slug);
  const evTag = s => {
    const parts = [];
    if (s.sourceType) parts.push('<span class="tier">' + esc(s.sourceType) + '</span>');
    if (s.trialPhase && s.trialPhase !== 'N/A') parts.push(esc(s.trialPhase));
    if (Number(s.patientN) > 0) parts.push('n=' + num(s.patientN));
    return parts.join(' &#183; ');
  };
  const img = hero(lead);
  let h = '<div class="container front"><div class="front-grid">';
  h += '<div class="front-lead">' +
    '<span class="kicker">' + esc(lead.category) + '</span>' +
    '<h1 class="lead-hed"><a href="' + su(lead) + '">' + esc(plainHead(lead.headline)) + '</a></h1>' +
    '<p class="lead-dek">' + esc(lead.lede) + '</p>' +
    '<p class="lead-byline meta-mono">By ' + esc(realAuthor(lead)) + ' &#183; ' + esc(fmtDate(lead.publishDate)) + '</p>' +
    (img ? '<figure class="lead-fig"><a href="' + su(lead) + '"><img src="' + esc(img) + '" alt="' + esc(lead.imageCaption || plainHead(lead.headline)) + '" width="1600" height="900" decoding="async"></a>' +
      '<figcaption class="figcredit">' + esc(lead.imageCaption || '[NATHAN: COPY]') + ' &#183; ' + esc(lead.imageCredit || '[NATHAN: COPY]') + '</figcaption></figure>' : '') +
    '</div>';
  h += '<div class="front-secondary">' + secondary.map(s =>
    '<article class="sec-item">' +
    '<span class="kicker">' + esc(s.category) + '</span>' +
    '<h2 class="sec-hed"><a href="' + su(s) + '">' + esc(plainHead(s.headline)) + '</a></h2>' +
    '<p class="sec-dek">' + esc(s.lede) + '</p>' +
    (evTag(s) ? '<p class="meta-mono">' + evTag(s) + '</p>' : '') +
    '</article>').join('') + '</div>';
  h += '<aside class="verified-rail"><h2 class="rail-head">What&#8217;s Verified</h2><ul class="rail-list">' +
    rail.map(s => '<li class="rail-item"><a href="' + su(s) + '"><span class="rail-claim">' + esc(plainHead(s.headline)) + '</span>' +
      (evTag(s) ? '<span class="rail-tag">' + evTag(s) + '</span>' : '') + '</a></li>').join('') +
    '</ul></aside>';
  h += '</div>'; /* /front-grid */
  if (brief.length) {
    h += '<hr class="rule-major"><p class="brief-head">Latest</p><div class="brief-grid">' +
      brief.map(s => '<article class="brief-row"><span class="kicker">' + esc(s.category) + '</span>' +
        '<h3 class="brief-hed"><a href="' + su(s) + '">' + esc(plainHead(s.headline)) + '</a></h3>' +
        '<p class="brief-meta meta-mono">' + (evTag(s) ? evTag(s) + ' &#183; ' : '') + esc(fmtDate(s.publishDate)) + '</p></article>').join('') +
      '</div>';
  }
  h += '</div>'; /* /container front */
  return h;
}

/* inject baked content + canonical into the existing index.html shell
   (kept in place at root, so its relative asset paths still resolve) */
function buildHomepage(stories) {
  const file = path.join(ROOT, 'index.html');
  if (!fs.existsSync(file)) { console.warn('[lumen build] index.html not found, skipping homepage pre-render'); return false; }
  let html = fs.readFileSync(file, 'utf8');
  // idempotency: strip any head block we injected on a previous build
  html = html.replace(/\s*<!--LUMEN-SSR-->[\s\S]*?<!--\/LUMEN-SSR-->/g, '');
  // harden: make asset/script paths absolute so they resolve at any route depth
  html = html
    .replace(/(href|src)="assets\//g, '$1="/assets/')
    .replace(/(href|src)="data\//g, '$1="/data/')
    .replace(/src="\/data\/stories\.js"/g, 'src="/data/stories.min.js"');
  const ordered = sortedStories(stories);
  /* positioning proof statement, baked so it is crawlable and does not flash on
     hydrate. KEEP IN SYNC with app.js renderHome standard-band. */
  const ssr = '<div class="standard-band"><p class="proof-statement">Every claim traced to its primary source, graded for evidence quality, shown openly.</p></div>' +
    frontHTML(stories);
  const ld = '<script type="application/ld+json">' + jsonEsc(JSON.stringify(itemListLD(ordered, 'Lumen', SITE + '/'))) + '</script>';

  // 1) bake listing into the #page container (idempotent: matches empty or filled)
  if (/<main id="page">[\s\S]*?<\/main>/.test(html)) {
    html = html.replace(/<main id="page">[\s\S]*?<\/main>/, '<main id="page">' + ssr + '</main>');
  } else {
    console.warn('[lumen build] #page container not found in index.html, skipping homepage injection');
    return false;
  }
  // 2) canonical = bare root; fix og:url to match
  html = html.replace(/https:\/\/readlumen\.site\/index\.html/g, 'https://readlumen.site/');
  const headAdd = '<!--LUMEN-SSR-->' +
    (/rel="canonical"/.test(html) ? '' : '<link rel="canonical" href="' + SITE + '/">') +
    ld + '<!--/LUMEN-SSR-->';
  html = html.replace('</head>', headAdd + '\n</head>');
  fs.writeFileSync(file, html);
  return true;
}

/* generate a full static page per category at /category/{slug}/ (absolute assets) */
function categoryHTML(catName, slug, stories) {
  const list = sortedStories(stories.filter(s => s.category === catName));
  const url = SITE + '/category/' + slug;
  const title = catName + ' \u00B7 Lumen';
  const desc = 'The latest evidence-first ' + catName + ' breakthroughs on Lumen, each graded against the Lumen Standard.';
  const ld = itemListLD(list, catName + ', Lumen', url);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#FFFFFF">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Lumen">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE}/assets/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="alternate" type="application/rss+xml" title="Lumen RSS" href="/feed.xml">
<link rel="stylesheet" href="/assets/styles.css">
<script type="application/ld+json">${jsonEsc(JSON.stringify(ld))}</script>
</head>
<body>
<div id="chrome"></div>
<main id="page"><section class="ssr-home"><h1>${esc(catName)}</h1>${listingHTML(list)}</section></main>
<div id="site-footer"></div>
<script>window.__LUMEN_CAT__=${JSON.stringify(slug)};</script>
<script src="/data/stories.min.js"></script>
<script src="/assets/app.js"></script>
<script>LUMEN.renderCategory();</script>
<script defer src="/_vercel/insights/script.js"></script>
</body>
</html>
`;
}

/* generate the Verification Board page at /board/ (content baked for crawlers,
   then hydrated by app.js renderBoard). KEEP COPY IN SYNC with renderBoard. */
function boardHTML() {
  const url = SITE + '/board';
  const title = 'Verification Board · Lumen';
  const desc = 'The Lumen Verification Board: credentialed experts who oversee how health claims are verified against the Lumen Standard.';
  const inner = '<div class="prose">' +
    '<span class="kicker">Trust</span>' +
    '<h1>Verification Board</h1>' +
    '<p>Every Lumen story is reviewed against the Lumen Standard. Our verification is overseen by credentialed experts in clinical trial methodology, pharmacology, and health economics.</p>' +
    '<h2>Recruiting founding members</h2>' +
    '<p>We are recruiting founding board members. If you hold credentials in biostatistics, drug development, or health economics and want to help define how health claims get verified, we want to hear from you.</p>' +
    '<p style="margin-top:32px"><a class="btn" href="mailto:board@readlumen.site?subject=Lumen%20Verification%20Board">Join or nominate a board member</a></p>' +
    '</div>';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#FFFFFF">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Lumen">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE}/assets/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="alternate" type="application/rss+xml" title="Lumen RSS" href="/feed.xml">
<link rel="stylesheet" href="/assets/styles.css">
</head>
<body>
<div id="chrome"></div>
<main id="page">${inner}</main>
<div id="site-footer"></div>
<script src="/data/stories.min.js"></script>
<script src="/assets/app.js"></script>
<script>LUMEN.renderBoard();</script>
<script defer src="/_vercel/insights/script.js"></script>
</body>
</html>
`;
}

/* ---------- sitemap + llms.txt ---------- */
function buildSitemap(stories) {
  const staticPages = ['/', '/about.html', '/board', '/corrections.html', '/privacy.html']
    .map(p => `  <url><loc>${SITE}${p}</loc></url>`);
  const cats = Object.values(CAT_SLUGS).map(c => `  <url><loc>${SITE}/category/${c}</loc></url>`);
  const storyUrls = stories.map(s =>
    `  <url><loc>${SITE}/story/${cleanSlug(s.slug)}</loc><lastmod>${fmtISO(s.publishDate).slice(0, 10)}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages.join('\n')}
${cats.join('\n')}
${storyUrls.join('\n')}
</urlset>
`;
}
function buildLlms(stories) {
  const lines = stories.slice().sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate))
    .map(s => `- [${plainHead(s.headline)}](${SITE}/story/${cleanSlug(s.slug)}): ${(s.metaDescription || s.lede || '').slice(0, 160)}`);
  const cats = Object.keys(CAT_SLUGS).map(name => `- [${name}](${SITE}/category/${CAT_SLUGS[name]})`).join('\n');
  return `# Lumen

> Lumen is an evidence-first health and medical-technology news publication. Every story is graded against the Lumen Standard, a documented set of five checks (source tier, trial phase, reported patient numbers, absolute effect size, disease burden) before publication. Author and publisher: ${AUTHOR}.

Lumen content may be cited with attribution to Lumen (${SITE}). Figures are reported in absolute terms; corrections are logged publicly.

- Homepage: ${SITE}/

## Sections
${cats}

## Stories
${lines.join('\n')}

## Editorial standards
- ${SITE}/about.html
- ${SITE}/board
- ${SITE}/corrections.html
`;
}

/* ---------- run ---------- */
async function build() {
  const data = await loadData();
  DATA = data;
  const stories = (data.stories || []).filter(s => s && s.slug);
  // resolve every hero image ONCE: decode base64 -> /assets/img/{slug}.{ext}
  let imgCount = 0;
  stories.forEach(s => {
    const before = s.heroImage || '';
    HERO[cleanSlug(s.slug)] = resolveHero(s);
    if (before.indexOf('data:') === 0 && HERO[cleanSlug(s.slug)].indexOf('/assets/img/') === 0) imgCount++;
  });
  // slim data file for public pages (paths, not base64)
  const minBytes = buildMinData(stories);
  let n = 0;
  stories.forEach(s => {
    const slug = cleanSlug(s.slug);
    if (!slug) return;
    const dir = path.join(ROOT, 'story', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), storyHTML(s, stories));
    n++;
  });
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), buildSitemap(stories));
  fs.writeFileSync(path.join(ROOT, 'llms.txt'), buildLlms(stories));

  // verification board page at /board/
  fs.mkdirSync(path.join(ROOT, 'board'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'board', 'index.html'), boardHTML());

  // homepage (in-place injection) + a static page per category
  const homeOk = buildHomepage(stories);
  let catCount = 0;
  Object.keys(CAT_SLUGS).forEach(name => {
    const slug = CAT_SLUGS[name];
    const dir = path.join(ROOT, 'category', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), categoryHTML(name, slug, stories));
    catCount++;
  });
  console.log('[lumen build] pre-rendered ' + n + ' story pages, ' + catCount + ' category pages, homepage ' +
    (homeOk ? 'baked' : 'SKIPPED') + ', extracted ' + imgCount + ' images, stories.min.js ' +
    (minBytes / 1024).toFixed(0) + ' KB, sitemap + llms.txt');
}
build().catch(e => { console.error('[lumen build] failed:', e); process.exit(1); });
