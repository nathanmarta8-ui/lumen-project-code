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

/* The Lumen Standard v2.0 deterministic rule, shared with the browser (app.js)
   and admin. Resolved once here so evidenceHTML stays textually identical to its
   app.js twin (which reads the same module via window.LUMEN_STANDARD). */
const STD = require('../assets/lumen-standard.js');

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

/* The evidence card (ported from the "Evidence Card System" design), now driven
   by the Lumen Standard v2.0. The hero verdict is the deterministic Evidence
   Certainty rating computed by STD.certaintyRating(s) (assets/lumen-standard.js),
   never hand-typed, so any reader can reconstruct it from the check fields. The
   five checks, the optional finding sentence and the optional dot-array /
   association visual are editorial (s.evidence.*). Content stays in the DOM (no
   JS) so crawlers read it. KEEP IN SYNC with the twin copy (lib/story-render.js
   <-> assets/app.js): both must emit identical markup. STD is resolved once per
   file (Node require vs browser global) so these bodies stay textually identical. */
function evidenceHTML(s) {
  var ev = s.evidence || {};
  var rating = STD ? STD.certaintyRating(s) : null;
  function evIcon(status) {
    if (status === 'passed') return '<svg class="ev-ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>';
    if (status === 'flagged') return '<svg class="ev-ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 2.5 20.5h19z"></path><path d="M12 10.5v4"></path><circle cx="12" cy="17.6" r="0.8" fill="currentColor" stroke="none"></circle></svg>';
    return '<svg class="ev-ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M8 12h8"></path></svg>';
  }
  function evCheck(label, value, status) {
    var word = status === 'passed' ? 'Passed' : status === 'flagged' ? 'Flagged' : 'N/A';
    var val = status === 'na'
      ? '<span class="ev-na-pre">Not applicable by design. </span>' + esc(value)
      : esc(value);
    return '<div class="ev-check ev-' + status + '">' +
      '<div class="ev-status">' + evIcon(status) + '<span class="ev-word">' + word + '</span></div>' +
      '<div class="ev-detail"><div class="ev-label">' + esc(label) + '</div>' +
      '<div class="ev-value">' + val + '</div></div></div>';
  }

  /* ---- the five checks: story-provided override, else derived from the Standard's
     check fields (Check 1 source tier, Check 2 study type, Check 3 n, Check 4
     absolute effect, Check 5 burden) ---- */
  var defs;
  if (ev.checks && ev.checks.length) {
    defs = ev.checks.map(function (c) { return { label: c.label, value: c.value, status: c.status || 'passed' }; });
  } else {
    var srcTier = STD && s.sourceTier ? (STD.sourceTier(s.sourceTier) || {}).label : '';
    var srcLabel = srcTier || s.sourceType || 'Not reported';
    var srcStatus = s.sourceTier === 'press-release' ? 'na' : (s.sourceTier === 'preprint' ? 'flagged' : (s.sourceTier || s.sourceType ? 'passed' : 'flagged'));
    var stObj = STD && s.studyType ? STD.studyType(s.studyType) : null;
    var isPre = s.studyType === 'preclinical';
    var studyLabel = stObj ? stObj.label : (s.trialPhase && !/^n\/?a$/i.test(s.trialPhase) ? s.trialPhase : 'Not reported');
    var nObs = !s.patientN || Number(s.patientN) <= 0;
    var relOnly = !!s.effectIsRelativeOnly;
    defs = [
      { label: 'Source tier', value: srcLabel + (s.journal ? ' · ' + s.journal : ''), status: srcStatus },
      { label: 'Study type', value: studyLabel, status: isPre ? 'na' : (stObj || s.trialPhase ? 'passed' : 'flagged') },
      { label: 'Sample size (n)', value: nObs ? 'Not reported' : num(s.patientN), status: nObs ? 'na' : 'passed' },
      { label: 'Effect size (absolute)', value: (s.effectSize || 'Not reported') + (relOnly ? ' (relative figure only)' : ''), status: relOnly ? 'flagged' : (s.effectSize ? 'passed' : 'na') },
      { label: 'Disease burden', value: s.diseaseBurden || 'Not reported', status: s.diseaseBurden ? 'passed' : 'flagged' }
    ];
  }
  var checks = defs.map(function (d) { return evCheck(d.label, d.value, d.status); }).join('');
  var meta = rating && rating.label ? 'Evidence certainty · ' + rating.label : (function () {
    var p = 0; defs.forEach(function (d) { if (d.status === 'passed') p++; }); return p + ' of ' + defs.length + ' checks passed';
  })();

  /* ---- eyebrow badges (optional) ---- */
  var badges = '';
  if (ev.illustrative) badges += '<span class="ev-badge">Illustrative figures</span>';

  /* ---- note icons ---- */
  var noteFlagIc = '<svg class="ev-note-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5 3 20h18z"></path><path d="M12 10.5v3.6"></path><circle cx="12" cy="17.2" r="0.7" fill="currentColor" stroke="none"></circle></svg>';
  var noteInfoIc = '<svg class="ev-note-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5"></path><circle cx="12" cy="7.6" r="0.7" fill="currentColor" stroke="none"></circle></svg>';

  /* ---- hero verdict: the deterministic Evidence Certainty rating (Rule v2.0) ---- */
  var hero = '';
  if (rating && rating.label) {
    var segs = '';
    for (var i = 0; i < 4; i++) segs += '<span class="ev-seg' + (i < rating.strength ? ' ev-seg-on' : '') + '"></span>';
    var cNote = rating.note ? ('<div class="ev-note' + (rating.flagged ? ' ev-note-flag' : '') + '">' + (rating.flagged ? noteFlagIc : noteInfoIc) + '<span>' + esc(rating.note) + '</span></div>') : '';
    var boundary = ev.boundary || rating.boundary;
    hero = '<div class="ev-verdict ev-verdict-' + rating.label.toLowerCase().replace(/ /g, '-') + '">' +
      '<div class="ev-verdict-kicker">Evidence certainty</div>' +
      '<div class="ev-verdict-head"><span class="ev-verdict-big">' + esc(rating.label) + '</span>' +
      '<span class="ev-verdict-tier">' + esc(rating.tier) + '</span></div>' +
      '<div class="ev-strength" aria-hidden="true">' + segs + '</div>' + cNote +
      (boundary ? '<p class="ev-boundary">' + esc(boundary) + '</p>' : '') +
      '</div>';
  }

  /* ---- type-specific visual (optional): dot array or association ---- */
  var visual = '';
  if (ev.visual === 'dotArray') {
    var dot = ev.dot || {};
    var soc = Number(dot.soc) || 0, gain = Number(dot.gain) || 0, rem = 100 - soc - gain;
    var cells = '';
    for (var d = 0; d < 100; d++) {
      var cls = d < soc ? 'ev-dot-soc' : (d < soc + gain ? 'ev-dot-gain' : 'ev-dot-none');
      cells += '<span class="ev-dot ' + cls + '"></span>';
    }
    var lab = dot.labels || {};
    var socLabel = lab.soc || ('Baseline: ' + soc + ' in 100');
    var gainLabel = lab.gain || ('Benefit from the therapy: ' + gain + ' more in 100, reaching ' + (soc + gain));
    var noneLabel = lab.none || ('No benefit: ' + rem + ' in 100');
    var legend = '<div class="ev-legend-item"><span class="ev-dot ev-dot-soc"></span><span>' + esc(socLabel) + '</span></div>' +
      '<div class="ev-legend-item"><span class="ev-dot ev-dot-gain"></span><span>' + esc(gainLabel) + '</span></div>' +
      '<div class="ev-legend-item"><span class="ev-dot ev-dot-none"></span><span>' + esc(noneLabel) + '</span></div>';
    visual = '<div class="ev-visual"><div class="ev-visual-label">Absolute effect</div>' +
      (dot.title ? '<div class="ev-visual-title">' + esc(dot.title) + '</div>' : '') +
      '<div class="ev-dotwrap"><div class="ev-dotgrid">' + cells + '</div><div class="ev-legend">' + legend + '</div></div></div>';
  } else if (ev.visual === 'association') {
    var assoc = ev.assoc || {};
    visual = '<div class="ev-visual"><div class="ev-visual-label">What the evidence can show</div>' +
      '<div class="ev-assoc">' +
      '<div class="ev-assoc-card ev-assoc-supports"><div class="ev-assoc-head">Supports</div><p>' + esc(assoc.supports || '') + '</p></div>' +
      '<div class="ev-assoc-card ev-assoc-cannot"><div class="ev-assoc-head">Cannot show</div><p>' + esc(assoc.cannot || '') + '</p></div>' +
      '</div></div>';
  }

  /* ---- footer ---- */
  var arrow = '<svg class="ev-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>';
  var chevron = '<svg class="ev-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>';
  var checkIc = '<svg class="ev-verified" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>';
  var finding = (ev.finding || s.evidenceFinding) ? esc(ev.finding || s.evidenceFinding)
    : 'Every Lumen story clears five checks before it runs. Here is how this one is sourced, in the open.';

  var foot = '<div class="evidence-foot">';
  if (s.reviewedBy) foot += '<span class="evidence-source">Verified by ' + esc(s.reviewedBy) + (s.verifiedDate ? ', ' + esc(s.verifiedDate) : '') + '.</span>';
  if (s.journal) foot += '<span class="evidence-source">Primary source: ' + esc(s.journal) + '.</span>';
  if (s.journalUrl) foot += '<a href="' + esc(s.journalUrl) + '" rel="noopener" target="_blank">View primary source ' + arrow + '</a>';
  if (s.nctId) foot += '<a href="https://clinicaltrials.gov/study/' + esc(s.nctId) + '" rel="noopener" target="_blank">Registration ' + esc(s.nctId) + ' ' + arrow + '</a>';
  foot += '<a href="/about.html">Read the Lumen Standard ' + arrow + '</a></div>';

  return '<details class="evidence">' +
    '<summary class="evidence-summary">' +
    '<span class="evidence-kicker">' + checkIc + 'Verified · The Lumen Standard' + badges + '</span>' +
    '<h2 class="evidence-title" id="evidence-title">The evidence</h2>' +
    '<span class="evidence-meta">' + meta + '</span>' +
    '<span class="evidence-toggle">' + chevron +
    '<span class="evidence-toggle-txt"><span class="evidence-toggle-show">Show the evidence</span><span class="evidence-toggle-hide">Hide</span></span></span>' +
    '</summary>' +
    '<div class="evidence-body">' +
    '<p class="evidence-sub">' + finding + '</p>' +
    hero + visual +
    '<div class="evidence-checks-head">The five checks</div>' +
    checks + foot +
    '</div>' +
    '</details>';
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
<script src="/assets/lumen-standard.js"></script>
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
