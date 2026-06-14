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
function realAuthor(s) { var a = (s.author || '').trim(); return (!a || a.toLowerCase().indexOf('lumen') === 0) ? AUTHOR : a; }

/* "Breakthroughs you might've missed" — baked into static HTML for SEO/GEO internal links */
function missedBreakthroughs(current, all, n) {
  return all.filter(x => cleanSlug(x.slug) !== cleanSlug(current.slug))
    .slice()
    .sort((a, b) => ((Number(b.impact) || 0) - (Number(a.impact) || 0)) || (new Date(a.publishDate) - new Date(b.publishDate)))
    .slice(0, n || 4);
}
function asideStaticHTML(current, all) {
  const missed = missedBreakthroughs(current, all, 4);
  const items = missed.map(s => {
    const tag = (s.journal ? esc(s.journal) + ' &#183; ' : '') + 'Impact ' + esc(s.impact) + '/10';
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
  const img = (s.heroImage && s.heroImage.indexOf('data:') !== 0) ? s.heroImage : SITE + '/assets/og-image.png';
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
  bodyInner.push('<p class="breadcrumb"><a href="/index.html">Home</a> &#8594; <a href="/category.html?cat=' + catSlug(s.category) + '">' + esc(s.category) + '</a></p>');
  bodyInner.push('<span class="cat-label">' + esc(s.category) + (s.subCategory ? ' &#183; ' + esc(s.subCategory) : '') + '</span>');
  bodyInner.push('<h1 class="article-headline">' + esc(title) + '</h1>');
  bodyInner.push('<p class="article-lede">' + esc(s.lede) + '</p>');
  bodyInner.push('<div class="article-meta-row"><div class="meta">' +
    '<span class="src-tag">' + esc(s.sourceType || 'Peer-reviewed') + '</span><span class="sep"></span>' +
    '<span class="byline">By ' + esc(realAuthor(s)) + '</span><span class="sep"></span>' +
    '<span>' + esc(fmtDate(s.publishDate)) + '</span><span class="sep"></span>' +
    '<span>' + esc(s.readTime || 3) + ' min read</span></div></div>');
  if (s.heroImage) {
    bodyInner.push('<figure><div class="article-hero"><img src="' + esc(s.heroImage) + '" alt="' + esc(s.imageCaption || title) + '"></div>' +
      '<figcaption class="caption">' + esc(s.imageCaption || '') + (s.imageCredit ? ' &#183; ' + esc(s.imageCredit) : '') + '</figcaption></figure>');
  }
  bodyInner.push('<div class="article-body">');
  if (s.whyItMatters) bodyInner.push('<div class="why-matters"><strong>Why it matters &#8212;</strong> ' + esc(s.whyItMatters) + '</div>');
  bodyInner.push(cleanBody(s.bodyHtml) || '<p>' + esc(s.lede) + '</p>');
  bodyInner.push('</div>');
  /* the evidence box — the heart of the Lumen Standard, in static HTML */
  const rows = [];
  if (s.trialPhase) rows.push('<tr><td>Trial phase</td><td>' + esc(s.trialPhase) + '</td></tr>');
  if (s.patientN) rows.push('<tr><td>Patients (n)</td><td>' + esc(s.patientN) + '</td></tr>');
  if (s.effectSize) rows.push('<tr><td>Effect size (absolute)</td><td>' + esc(s.effectSize) + '</td></tr>');
  if (s.diseaseBurden) rows.push('<tr><td>Disease burden</td><td>' + esc(s.diseaseBurden) + '</td></tr>');
  if (rows.length) bodyInner.push('<div class="data-box"><h4>The data</h4><table>' + rows.join('') + '</table></div>');
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
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
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
<script src="/data/stories.js"></script>
<script src="/assets/app.js"></script>
<script>LUMEN.renderStory();</script>
<script defer src="/_vercel/insights/script.js"></script>
</body>
</html>
`;
}

/* ---------- sitemap + llms.txt ---------- */
function buildSitemap(stories) {
  const staticPages = ['/', '/about.html', '/corrections.html', '/privacy.html']
    .map(p => `  <url><loc>${SITE}${p}</loc></url>`);
  const cats = Object.values(CAT_SLUGS).map(c => `  <url><loc>${SITE}/category.html?cat=${c}</loc></url>`);
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
  return `# Lumen

> Lumen is an evidence-first health and medical-technology news publication. Every story is graded against a documented five-point editorial standard (source tier, trial phase, reported patient numbers, absolute effect size, disease burden) before publication. Author and publisher: ${AUTHOR}.

Lumen content may be cited with attribution to Lumen (${SITE}). Figures are reported in absolute terms; corrections are logged publicly.

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
  const stories = (data.stories || []).filter(s => s && s.slug);
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
  console.log(`[lumen build] pre-rendered ${n} story pages, sitemap (${stories.length} stories), llms.txt`);
}
build();
