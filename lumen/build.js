/* ============================================================
   LUMEN — GEO pre-render build
   Reads data/stories.js and writes a real, fully-rendered HTML
   file per story at /story/{slug}/index.html with baked-in
   <title>, meta description, Open Graph, and Article +
   MedicalWebPage JSON-LD. Also regenerates sitemap.xml and
   writes llms.txt. Runs at deploy time on Vercel.
   No dependencies — Node core only.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = 'https://readlumen.site';
const AUTHOR = 'Nathan Stanley Martanegara';
const PUBLISHER = 'Lumen';
const ROOT = __dirname;

/* ---------- load story data the same way the browser does ---------- */
function loadData() {
  const code = fs.readFileSync(path.join(ROOT, 'data', 'stories.js'), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window.LUMEN_DATA || { stories: [], corrections: [] };
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

/* The evidence — the verification surfaced as the article's anchor object.
   The five checks of the Lumen Standard, shown by default (no click).
   KEEP IN SYNC with assets/app.js evidenceHTML — both must emit identical
   markup so the prerendered page and the client render match exactly. */
function evidenceHTML(s) {
  return '<section class="evidence" aria-labelledby="evidence-title">' +
    '<div class="evidence-head">' +
    '<span class="evidence-kicker">Verified · The Lumen Standard</span>' +
    '<h2 class="evidence-title" id="evidence-title">The evidence</h2>' +
    '<p class="evidence-sub">Every Lumen story clears five checks before it runs. Here is how this one is sourced — in the open, no click required.</p>' +
    '</div>' +
    '<dl class="evidence-grid">' +
    '<div class="evidence-check"><dt>Source tier</dt><dd>' + esc(s.sourceType || 'Not reported') + (s.journal ? ' · ' + esc(s.journal) : '') + '</dd></div>' +
    '<div class="evidence-check"><dt>Trial phase</dt><dd>' + esc(s.trialPhase || 'Not reported') + '</dd></div>' +
    '<div class="evidence-check"><dt>Patients (n)</dt><dd>' + (s.patientN ? num(s.patientN) : 'Not reported') + '</dd></div>' +
    '<div class="evidence-check"><dt>Effect size (absolute)</dt><dd>' + esc(s.effectSize || 'Not reported') + '</dd></div>' +
    '<div class="evidence-check"><dt>Disease burden</dt><dd>' + esc(s.diseaseBurden || 'Not reported') + '</dd></div>' +
    '</dl>' +
    '<div class="evidence-foot">' +
    (s.journalUrl ? '<a class="uline" href="' + esc(s.journalUrl) + '" rel="noopener" target="_blank">View primary source →</a>' : '') +
    (s.nctId ? '<a class="uline" href="https://clinicaltrials.gov/study/' + esc(s.nctId) + '" rel="noopener" target="_blank">Registration ' + esc(s.nctId) + ' →</a>' : '') +
    '<a class="uline" href="/about.html">Read the Lumen Standard →</a>' +
    '</div>' +
    '</section>';
}

/* The reality check — a mandatory "what this does and doesn't mean" caveat,
   rendered as a distinct callout right after the evidence box. Omitted
   entirely when absent (older stories have no field). KEEP IN SYNC with
   assets/app.js realityCheckHTML — identical markup so prerender == client. */
function realityCheckHTML(s) {
  if (!s.realityCheck) return '';
  return '<aside class="reality-check" aria-label="What this does and doesn’t mean">' +
    '<p class="reality-check-label">What this does and doesn’t mean</p>' +
    '<p class="reality-check-text">' + esc(s.realityCheck) + '</p>' +
    '</aside>';
}
/* strip Word/Pages paste cruft → clean semantic HTML */
function cleanBody(h) {
  if (!h) return '';
  return h
    .replace(/<\/?(?:span|font|o:p|div)\b[^>]*>/gi, '')
    .replace(/\s(?:style|class|lang|dir|align|id|name|width|height)\s*=\s*"[^"]*"/gi, '')
    .replace(/\s(?:style|class|lang|dir|align|id|name|width|height)\s*=\s*'[^']*'/gi, '')
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
const CAT_SLUGS = {
  'Medicine': 'medicine', 'Biotechnology': 'biotechnology', 'Health Tech': 'health-tech',
  'Brain Science': 'brain-science', 'Longevity': 'longevity', 'Global Health': 'global-health',
  'Mental Health': 'mental-health'
};
function catSlug(name) { return CAT_SLUGS[name] || 'medicine'; }
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
function absImg(p) { return !p ? SITE + '/assets/og-image.png' : (p.charAt(0) === '/' ? SITE + p : p); }

/* slim data file the PUBLIC pages load instead of the 3 MB base64 stories.js.
   Same shape (window.LUMEN_DATA) but every base64 hero swapped for its file path. */
function buildMinData(stories) {
  const slim = stories.map(s => Object.assign({}, s, { heroImage: hero(s) }));
  const out = '/* AUTO-GENERATED by build.js — do not edit. Source of truth is data/stories.js.\n' +
    '   Hero images are extracted to /assets/img/ and referenced by path here so public\n' +
    '   pages stay lightweight. */\n' +
    'window.LUMEN_DATA = ' + JSON.stringify({ stories: slim, corrections: DATA.corrections || [] }) + ';\n';
  fs.writeFileSync(path.join(ROOT, 'data', 'stories.min.js'), out);
  return out.length;
}

/* "Breakthroughs you might've missed" — baked into static HTML for SEO/GEO internal links */
function missedBreakthroughs(current, all, n) {
  return all.filter(x => cleanSlug(x.slug) !== cleanSlug(current.slug))
    .slice()
    .sort((a, b) => (new Date(b.publishDate) - new Date(a.publishDate)))
    .slice(0, n || 4);
}
function asideStaticHTML(current, all) {
  const missed = missedBreakthroughs(current, all, 4);
  const items = missed.map(s => {
    const tag = s.journal ? esc(s.journal) : esc(s.category);
    return '<a class="aside-item" href="/story/' + cleanSlug(s.slug) + '">' +
      '<span class="cat-label">' + esc(s.category) + '</span>' +
      '<span class="aside-head">' + esc(plainHead(s.headline)) + '</span>' +
      '<span class="aside-tag">' + tag + '</span></a>';
  }).join('');
  return '<aside class="article-aside"><div class="aside-sticky">' +
    (items ? '<section class="aside-block"><h4 class="aside-title">Breakthroughs you might&#8217;ve missed</h4><div class="aside-list">' + items + '</div></section>' : '') +
    '<div class="ad-slot" data-slot="article-sidebar"></div>' +
    '</div></aside>';
}

/* ---------- per-story page ---------- */
function storyHTML(s, all) {
  const slug = cleanSlug(s.slug);
  const url = SITE + '/story/' + slug;
  const title = plainHead(s.headline);
  const desc = (s.metaDescription || s.lede || '').slice(0, 200);
  const heroPath = hero(s);
  const img = absImg(heroPath);
  const published = fmtISO(s.publishDate);

  /* JSON-LD: NewsArticle about a MedicalWebPage; named author + publisher */
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: title,
    description: desc,
    image: [img],
    datePublished: published,
    dateModified: published,
    author: [{ '@type': 'Person', name: realAuthor(s) }],
    publisher: {
      '@type': 'Organization', name: PUBLISHER,
      logo: { '@type': 'ImageObject', url: SITE + '/assets/og-image.png' }
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    articleSection: s.category,
    isAccessibleForFree: true
  };
  if (s.journal) {
    ld.citation = { '@type': 'CreativeWork', name: s.journal, url: s.journalUrl || undefined };
  }
  const medical = {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    name: title,
    description: desc,
    url: url,
    lastReviewed: published,
    audience: { '@type': 'MedicalAudience', audienceType: 'general public' }
  };

  /* server-rendered article body so crawlers/AI see real content */
  const bodyInner = [];
  bodyInner.push('<p class="breadcrumb"><a href="/">Home</a> &#8594; <a href="/category/' + catSlug(s.category) + '">' + esc(s.category) + '</a></p>');
  bodyInner.push('<span class="cat-label">' + esc(s.category) + (s.subCategory ? ' &#183; ' + esc(s.subCategory) : '') + '</span>');
  bodyInner.push('<h1 class="article-headline">' + esc(title) + '</h1>');
  bodyInner.push('<p class="article-lede">' + esc(s.lede) + '</p>');
  bodyInner.push('<div class="article-meta-row"><div class="meta">' +
    '<span class="src-tag">' + esc(s.sourceType || 'Peer-reviewed') + '</span><span class="sep"></span>' +
    '<span class="byline">By ' + esc(realAuthor(s)) + '</span><span class="sep"></span>' +
    '<span>' + esc(fmtDate(s.publishDate)) + '</span><span class="sep"></span>' +
    '<span>' + esc(s.readTime || 3) + ' min read</span></div></div>');
  if (heroPath) {
    bodyInner.push('<figure><div class="article-hero"><img src="' + esc(heroPath) + '" alt="' + esc(s.imageCaption || title) + '" width="1600" height="900" decoding="async"></div>' +
      '<figcaption class="caption">' + esc(s.imageCaption || '') + (s.imageCredit ? ' &#183; ' + esc(s.imageCredit) : '') + '</figcaption></figure>');
  }
  bodyInner.push('<div class="article-body">');
  if (s.whyItMatters) bodyInner.push('<div class="why-matters"><strong>Why it matters &#8212;</strong> ' + esc(s.whyItMatters) + '</div>');
  bodyInner.push(cleanBody(s.bodyHtml) || '<p>' + esc(s.lede) + '</p>');
  if (s.pullQuote) {
    bodyInner.push('<blockquote>&#8220;' + esc(s.pullQuote) + '&#8221;<p class="quote-attr">&#8212; ' + esc(s.pullQuoteAttribution || '') + '</p></blockquote>');
  }
  bodyInner.push('</div>');
  /* the evidence box — the heart of the Lumen Standard, surfaced as the
     page's anchor object in static HTML (mirrors app.js evidenceHTML) */
  bodyInner.push(evidenceHTML(s));
  var rc = realityCheckHTML(s);
  if (rc) bodyInner.push(rc);
  if (s.journal) bodyInner.push('<p class="source-line">Source: ' +
    (s.journalUrl ? '<a class="uline" href="' + esc(s.journalUrl) + '" rel="noopener" target="_blank">' + esc(s.journal) + '</a>' : esc(s.journal)) +
    ' &#183; ' + esc(realAuthor(s)) + ' &#183; ' + esc(fmtDate(s.publishDate)) + '</p>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#F5F0E8">
<title>${esc(title)} &#183; Lumen</title>
<meta name="description" content="${esc(desc)}">
<meta name="author" content="${esc(realAuthor(s))}">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Lumen">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(img)}">
<meta property="article:published_time" content="${esc(published)}">
<meta property="article:author" content="${esc(realAuthor(s))}">
<meta property="article:section" content="${esc(s.category)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="alternate" type="application/rss+xml" title="Lumen RSS" href="/feed.xml">
<link rel="stylesheet" href="/assets/styles.css">
<script type="application/ld+json">${jsonEsc(JSON.stringify(ld))}</script>
<script type="application/ld+json">${jsonEsc(JSON.stringify(medical))}</script>
</head>
<body>
<div id="chrome"></div>
<main id="page"><div class="article-layout"><div class="article-wrap">${bodyInner.join("\n")}</div>${asideStaticHTML(s, all)}</div></main>
<div id="site-footer"></div>
<script>window.__LUMEN_SLUG__=${JSON.stringify(slug)};</script>
<script src="/data/stories.min.js"></script>
<script src="/assets/app.js"></script>
<script>LUMEN.renderStory();</script>
<script defer src="/_vercel/insights/script.js"></script>
</body>
</html>
`;
}

/* ---------- homepage + category pre-render ---------- */
const CAT_NAME = Object.keys(CAT_SLUGS).reduce((m, name) => { m[CAT_SLUGS[name]] = name; return m; }, {});

/* a crawlable listing: each story as a real <article> with linked headline,
   lede, category, and evidence tag — present in raw HTML before JS runs */
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
  const ssr = '<section class="ssr-home">' +
    '<h1>Lumen \u2014 Breakthroughs Brought to Light</h1>' +
    '<p class="ssr-intro">Genuine medical and scientific breakthroughs, translated into clear, honest stories. Every story passes the Lumen Standard.</p>' +
    listingHTML(ordered) + '</section>';
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
  const ld = itemListLD(list, catName + ' \u2014 Lumen', url);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#F5F0E8">
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

/* ---------- sitemap + llms.txt ---------- */
function buildSitemap(stories) {
  const staticPages = ['/', '/about.html', '/corrections.html', '/privacy.html']
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
- ${SITE}/corrections.html
`;
}

/* ---------- run ---------- */
function build() {
  const data = loadData();
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
build();
