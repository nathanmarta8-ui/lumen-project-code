/* ============================================================
   LUMEN, shared story renderer
   Single source of truth for the per-story article page. Imported
   by BOTH build.js (nightly static bake) and api/story/[slug].js
   (dynamic fallback before the bake catches up), so a freshly
   published story renders byte-identically either way, no drift.

   Extracted verbatim from build.js. The only change: storyHTML's
   hero lookup is injectable via ctx.heroOf(s), so build.js can pass
   its base64->file extractor while the serverless fallback passes
   the Supabase URL straight through.
   No dependencies, Node core only.
   ============================================================ */
'use strict';

const SITE = 'https://readlumen.site';
const AUTHOR = 'Nathan Stanley Martanegara';
const PUBLISHER = 'Lumen';

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

/* The evidence box: the verification surfaced as the article's anchor object.
   KEEP IN SYNC with assets/app.js evidenceHTML. */
function evidenceHTML(s) {
  return '<section class="evidence" aria-labelledby="evidence-title">' +
    '<div class="evidence-head">' +
    '<span class="evidence-kicker">Verified · The Lumen Standard</span>' +
    '<h2 class="evidence-title" id="evidence-title">The evidence</h2>' +
    '<p class="evidence-sub">Every Lumen story clears five checks before it runs. Here is how this one is sourced: in the open, no click required.</p>' +
    '</div>' +
    '<dl class="evidence-grid">' +
    '<div class="evidence-check"><dt>Source tier</dt><dd>' + esc(s.sourceType || 'Not reported') + (s.journal ? ' · ' + esc(s.journal) : '') + '</dd></div>' +
    '<div class="evidence-check"><dt>Trial phase</dt><dd>' + esc(s.trialPhase || 'Not reported') + '</dd></div>' +
    '<div class="evidence-check"><dt>Patients (n)</dt><dd>' + (s.patientN ? num(s.patientN) : 'Not reported') + '</dd></div>' +
    '<div class="evidence-check"><dt>Effect size (absolute)</dt><dd>' + esc(s.effectSize || 'Not reported') + '</dd></div>' +
    '<div class="evidence-check"><dt>Disease burden</dt><dd>' + esc(s.diseaseBurden || 'Not reported') + '</dd></div>' +
    (s.reviewedBy ? '<div class="evidence-check"><dt>Verified by</dt><dd>' + esc(s.reviewedBy) + (s.verifiedDate ? ', ' + esc(s.verifiedDate) : '') + '</dd></div>' : '') +
    '</dl>' +
    '<div class="evidence-foot">' +
    (s.journalUrl ? '<a class="uline" href="' + esc(s.journalUrl) + '" rel="noopener" target="_blank">View primary source →</a>' : '') +
    (s.nctId ? '<a class="uline" href="https://clinicaltrials.gov/study/' + esc(s.nctId) + '" rel="noopener" target="_blank">Registration ' + esc(s.nctId) + ' →</a>' : '') +
    '<a class="uline" href="/about.html">Read the Lumen Standard →</a>' +
    '</div>' +
    '</section>';
}

/* The reality check, a mandatory "what this does and doesn't mean" caveat.
   KEEP IN SYNC with assets/app.js realityCheckHTML. */
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
function absImg(p) { return !p ? SITE + '/assets/og-image.png' : (p.charAt(0) === '/' ? SITE + p : p); }

/* "Breakthroughs you might've missed", baked into static HTML for SEO/GEO internal links */
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

/* ---------- per-story page ----------
   ctx.heroOf(s) -> public hero path/URL. Defaults to s.heroImage (already a
   URL in the Supabase world); build.js injects its base64->file resolver. */
function storyHTML(s, all, ctx) {
  ctx = ctx || {};
  const heroOf = ctx.heroOf || ((x) => x.heroImage || '');
  const slug = cleanSlug(s.slug);
  const url = SITE + '/story/' + slug;
  const title = plainHead(s.headline);
  const desc = (s.metaDescription || s.lede || '').slice(0, 200);
  const heroPath = heroOf(s);
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
  bodyInner.push(evidenceHTML(s));
  var rcTop = realityCheckHTML(s);
  if (rcTop) bodyInner.push(rcTop);
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
  if (s.whyItMatters) bodyInner.push('<div class="why-matters"><strong>Why it matters:</strong> ' + esc(s.whyItMatters) + '</div>');
  bodyInner.push(cleanBody(s.bodyHtml) || '<p>' + esc(s.lede) + '</p>');
  if (s.pullQuote) {
    bodyInner.push('<blockquote>&#8220;' + esc(s.pullQuote) + '&#8221;<p class="quote-attr">' + esc(s.pullQuoteAttribution || '') + '</p></blockquote>');
  }
  bodyInner.push('</div>');
  if (s.journal) bodyInner.push('<p class="source-line">Source: ' +
    (s.journalUrl ? '<a class="uline" href="' + esc(s.journalUrl) + '" rel="noopener" target="_blank">' + esc(s.journal) + '</a>' : esc(s.journal)) +
    ' &#183; ' + esc(realAuthor(s)) + ' &#183; ' + esc(fmtDate(s.publishDate)) + '</p>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#FFFFFF">
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

module.exports = {
  SITE, AUTHOR, PUBLISHER, CAT_SLUGS,
  esc, jsonEsc, plainHead, cleanSlug, fmtISO, fmtDate, num,
  evidenceHTML, realityCheckHTML, cleanBody, catSlug, realAuthor, absImg,
  missedBreakthroughs, asideStaticHTML, storyHTML
};
