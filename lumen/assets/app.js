/* ============================================================
   LUMEN — shared front-end logic
   Renders nav, ticker, footer + page bodies from window.LUMEN_DATA
   ============================================================ */
(function () {
  'use strict';

  var CATEGORIES = [
    { name: 'Medicine',       slug: 'medicine',       summary: 'Approvals, scale milestones and trial results at the inflection point — the moment research becomes treatment.', stat: 'Tracking the moments care actually changes' },
    { name: 'Biotechnology',  slug: 'biotechnology',  summary: 'Gene therapy, CRISPR and synthetic biology, covered at mechanism level — and only with human data.', stat: 'Human data required, always' },
    { name: 'Health Tech',    slug: 'health-tech',    summary: 'AI diagnostics, wearables, devices and surgical robotics — only where they change a clinical outcome, not just a process.', stat: 'Outcome data or it doesn\u2019t run' },
    { name: 'Brain Science',  slug: 'brain-science',  summary: 'BCIs, mental health trials, neurodegeneration and neuroplasticity, handled with the highest editorial care.', stat: 'Highest stakes, highest bar' },
    { name: 'Longevity',      slug: 'longevity',      summary: 'Senolytics, reprogramming and cognitive longevity — validated biological age metrics only, never proprietary scores.', stat: 'GrimAge, PhenoAge, DunedinPACE only' },
    { name: 'Global Health',  slug: 'global-health',  summary: 'Health interventions at scale in low- and middle-income countries, always with the access and equity angle.', stat: 'Coverage beyond the usual borders' },
    { name: 'Mental Health',  slug: 'mental-health',  summary: 'Treatment trials, digital mental health and solutions to the access gap.', stat: 'Signal over stigma' }
  ];

  var REACTIONS = [
    { key: 'fascinating', emoji: '\uD83D\uDD2C', label: 'Fascinating' },
    { key: 'important',   emoji: '\uD83D\uDCA1', label: 'Important' },
    { key: 'global',      emoji: '\uD83C\uDF0D', label: 'Global impact' },
    { key: 'hope',        emoji: '\u2764\uFE0F', label: 'Gives me hope' },
    { key: 'share',       emoji: '\uD83D\uDE4C', label: 'Share-worthy' }
  ];

  /* ---------- data ---------- */
  function localStories() {
    try { return JSON.parse(localStorage.getItem('lumen_local_stories') || '[]'); }
    catch (e) { return []; }
  }
  function hasAdminSession() {
    try {
      var s = JSON.parse(localStorage.getItem('lumen_session') || 'null');
      return !!(s && s.exp > Date.now());
    } catch (e) { return false; }
  }
  function allStories() {
    var base = (window.LUMEN_DATA && window.LUMEN_DATA.stories) || [];
    var merged = base.slice();
    var localCount = 0;
    if (hasAdminSession()) {
      localStories().forEach(function (s) {
        if (!merged.some(function (b) { return b.slug === s.slug; })) { merged.push(s); localCount++; }
      });
    }
    merged.sort(function (a, b) { return new Date(b.publishDate) - new Date(a.publishDate); });
    merged._localCount = localCount;
    return merged;
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function catSlug(name) {
    var c = CATEGORIES.filter(function (c) { return c.name === name; })[0];
    return c ? c.slug : 'medicine';
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function agoHours(iso) {
    var h = Math.max(1, Math.round((Date.now() - new Date(iso)) / 3600000));
    return h < 24 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
  }
  function num(n) { return Number(n || 0).toLocaleString('en-US'); }
  function storyUrl(s) { return 'story.html?slug=' + encodeURIComponent(s.slug); }
  function totalReactions(s) {
    var r = s.reactions || {};
    return ['fascinating', 'important', 'global', 'hope', 'share']
      .reduce(function (t, k) { return t + (Number(r[k]) || 0); }, 0);
  }

  function metaStrip(s) {
    return '<div class="meta">' +
      '<span>\uD83D\uDEE1\uFE0F ' + esc(s.sourceType || 'Peer-reviewed') + '</span>' +
      (s.journal ? '<span class="sep"></span><span>' + esc(s.journal) + '</span>' : '') +
      '<span class="sep"></span><span>\u23F1 ' + esc(s.readTime || 3) + ' min read</span>' +
      '<span class="sep"></span><span class="impact"><span class="impact-dot"></span>Impact ' + esc(s.impact) + '/10</span>' +
      '</div>';
  }

  function cardHTML(s, opts) {
    opts = opts || {};
    var readers = Number(s.readersToday) || 0;
    return '<article class="card">' +
      (opts.region && s.region ? '<span class="region-tag">' + esc(s.region) + '</span>' : '') +
      '<span class="cat-label">' + esc(s.category) + (s.subCategory ? ' \u00B7 ' + esc(s.subCategory) : '') + '</span>' +
      '<h3><a href="' + storyUrl(s) + '">' + esc(s.headline) + '</a></h3>' +
      '<p class="lede">' + esc(s.lede) + '</p>' +
      (s.whyItMatters ? '<p class="why">Why it matters \u2014 ' + esc(s.whyItMatters) + '\u2026</p>' : '') +
      '<div class="card-foot">' + metaStrip(s) +
      (readers ? '<p class="readers"><span class="up">\u2191</span> ' + num(readers) + ' people read this today \u00B7 ' + agoHours(s.publishDate) + '</p>' : '') +
      '<div><a class="btn btn-sm" href="' + storyUrl(s) + '">Read the breakthrough \u2192</a></div>' +
      '</div></article>';
  }

  /* ---------- chrome: nav / ticker / footer ---------- */
  function navHTML(active) {
    var links = CATEGORIES.map(function (c) {
      var cur = active === c.slug ? ' aria-current="page"' : '';
      return '<a href="category.html?cat=' + c.slug + '"' + cur + '>' + c.name + '</a>';
    }).join('');
    return '<nav class="nav"><div class="nav-inner">' +
      '<a class="nav-logo" href="index.html">Lumen</a>' +
      '<div class="nav-links">' + links + '</div>' +
      '<div class="nav-right">' +
      '<a class="btn btn-sm" href="#newsletter">Newsletter</a>' +
      '<a class="nav-signin" href="admin.html">Sign in</a>' +
      '</div></div></nav>';
  }

  function tickerHTML(stories) {
    var items = stories.filter(function (s) { return s.breaking; });
    if (!items.length) items = stories.slice(0, 6);
    if (!items.length) return '';
    var links = items.map(function (s) {
      return '<a href="' + storyUrl(s) + '">' + esc(s.headline) + '</a>';
    }).join('<span class="ticker-sep">|</span>');
    // duplicate for seamless loop
    return '<div class="ticker" aria-label="Breaking news">' +
      '<span class="ticker-label">Signal</span>' +
      '<div class="ticker-track">' + links + '<span class="ticker-sep">|</span>' + links + '</div></div>';
  }

  function newsletterHTML(id) {
    return '<div class="newsletter" id="' + (id || 'newsletter') + '">' +
      '<h2>Understand the future in 5 minutes.</h2>' +
      '<p class="sub">Tuesday and Friday. No noise. No hype.</p>' +
      '<form class="newsletter-form" data-newsletter>' +
      '<input type="email" required placeholder="you@example.com" aria-label="Email address">' +
      '<button class="btn" type="submit">Get the signal \u2192</button></form>' +
      '<p class="proof">No spam. Unsubscribe anytime.</p></div>';
  }

  function footerHTML() {
    var year = new Date().getFullYear();
    return '<footer class="site-footer"><div class="container">' +
      '<div class="footer-grid">' +
      '<div><span class="footer-logo">Lumen</span><p class="footer-mission">Breakthroughs brought to light. The world\u2019s most important medical and technological advances, translated into clear, human stories.</p></div>' +
      '<div><h4>Sections</h4>' + CATEGORIES.slice(0, 4).map(function (c) { return '<a href="category.html?cat=' + c.slug + '">' + c.name + '</a>'; }).join('') + '</div>' +
      '<div><h4>More</h4>' + CATEGORIES.slice(4).map(function (c) { return '<a href="category.html?cat=' + c.slug + '">' + c.name + '</a>'; }).join('') + '</div>' +
      '<div><h4>Lumen</h4><a href="corrections.html">Correction log</a><a href="#newsletter">Newsletter</a><a href="admin.html">Editor sign in</a></div>' +
      '</div>' +
      '<div class="footer-bottom"><span>\u00A9 ' + year + ' Lumen \u00B7 readlumen.site</span>' +
      '<span>Lumen is journalism, not medical advice. Always consult a qualified clinician.</span></div>' +
      '</div></footer>';
  }

  function mountChrome(active, stories) {
    var chrome = document.getElementById('chrome');
    if (chrome) {
      var note = '';
      if (stories._localCount) {
        note = '<div class="preview-note">Previewing ' + stories._localCount +
          ' locally published ' + (stories._localCount === 1 ? 'story' : 'stories') +
          ' (visible only to you). Download <strong>stories.js</strong> from <a href="admin.html">Admin</a> and redeploy to publish for everyone.</div>';
      }
      chrome.innerHTML = navHTML(active) + tickerHTML(stories) + note;
    }
    var foot = document.getElementById('site-footer');
    if (foot) foot.innerHTML = footerHTML();
    document.addEventListener('submit', function (e) {
      var f = e.target.closest('[data-newsletter]');
      if (!f) return;
      e.preventDefault();
      var email = f.querySelector('input').value;
      try {
        var list = JSON.parse(localStorage.getItem('lumen_newsletter') || '[]');
        if (list.indexOf(email) === -1) list.push(email);
        localStorage.setItem('lumen_newsletter', JSON.stringify(list));
      } catch (err) {}
      f.outerHTML = '<p class="ok">You\u2019re on the list. First issue lands Tuesday or Friday \u2014 whichever comes first.</p>';
    });
  }

  /* ---------- page: home ---------- */
  function renderHome() {
    var stories = allStories();
    mountChrome(null, stories);
    var root = document.getElementById('page');

    if (!stories.length) {
      root.innerHTML = '<div class="container empty">' +
        '<span class="cat-label">Breakthroughs brought to light</span>' +
        '<h2>The first stories are on their way.</h2>' +
        '<p>Lumen translates the world\u2019s most important medical and technological advances into clear, human stories. Daily updates begin shortly \u2014 get the newsletter and be first.</p>' +
        '<div class="container" style="max-width:560px">' + newsletterHTML() + '</div></div>';
      return;
    }

    var hero = stories.filter(function (s) { return s.featured; })[0] || stories[0];
    var rest = stories.filter(function (s) { return s !== hero; });
    var today = rest.slice(0, 4);
    var afterToday = rest.slice(4);
    var html = '';

    /* Hero */
    html += '<section class="hero"><div class="container"><div class="hero-inner">' +
      (hero.heroImage ? '<div class="hero-img"><img src="' + esc(hero.heroImage) + '" alt="' + esc(hero.imageCaption || hero.headline) + '"></div>' : '') +
      '<div><span class="cat-label">' + esc(hero.category) + '</span>' +
      '<h1><a href="' + storyUrl(hero) + '">' + esc(hero.headline) + '</a></h1>' +
      '<p class="lede">' + esc(hero.lede) + '</p>' + metaStrip(hero) +
      '<p style="margin-top:20px"><a class="btn" href="' + storyUrl(hero) + '">Read the breakthrough \u2192</a></p>' +
      '</div></div></div></section>';

    /* Major breakthroughs today */
    if (today.length) {
      html += '<section class="section"><div class="container">' +
        '<div class="section-head"><h2 class="section-title">Major breakthroughs today</h2>' +
        '<span class="section-date">' + fmtDate(new Date().toISOString()) + '</span></div>' +
        '<div class="grid-2">' + today.map(function (s) { return cardHTML(s); }).join('') + '</div></div></section>';
    }

    /* This week's signal */
    html += '<section class="section"><div class="container">' +
      '<div class="section-head"><h2 class="section-title">This week\u2019s signal</h2></div>' +
      '<div class="chip-bar" id="signal-chips"></div><div class="row-list" id="signal-list"></div></div></section>';

    /* Newsletter mid-page */
    html += '<section class="section"><div class="container">' + newsletterHTML('newsletter') + '</div></section>';

    /* Sponsored slot */
    html += '<section class="section"><div class="container"><div class="sponsored">' +
      '<span class="tag">Sponsored</span>Advertising slot \u2014 reserved. Lumen labels every sponsored placement.</div></div></section>';

    /* Human impact */
    var quoted = stories.filter(function (s) { return s.pullQuote; })[0];
    if (quoted) {
      html += '<section class="section"><div class="container"><div class="human-impact">' +
        (quoted.heroImage ? '<div class="hero-img"><img src="' + esc(quoted.heroImage) + '" alt=""></div>' : '<div></div>') +
        '<div><span class="cat-label">Human impact</span>' +
        '<blockquote>\u201C' + esc(quoted.pullQuote) + '\u201D</blockquote>' +
        '<p class="quote-attr">\u2014 ' + esc(quoted.pullQuoteAttribution || '') + '</p>' +
        '<p style="margin-top:16px"><a href="' + storyUrl(quoted) + '">Read the full story \u2192</a></p>' +
        '</div></div></div></section>';
    }

    /* Most read this week */
    var mostRead = stories.slice().sort(function (a, b) { return (b.readersToday || 0) - (a.readersToday || 0); }).slice(0, 5);
    if (mostRead.length >= 2) {
      html += '<section class="section"><div class="container">' +
        '<div class="section-head"><h2 class="section-title">Most read this week</h2></div>' +
        '<div class="row-list">' + mostRead.map(function (s, i) {
          return '<div class="row"><span class="row-rank">' + (i + 1) + '</span>' +
            '<div><span class="cat-label">' + esc(s.category) + '</span><h3><a href="' + storyUrl(s) + '">' + esc(s.headline) + '</a></h3></div>' +
            '<span class="impact"><span class="impact-dot"></span>' + esc(s.impact) + '/10</span></div>';
        }).join('') + '</div></div></section>';
    }

    /* From the lab */
    if (afterToday.length) {
      html += '<section class="section"><div class="container">' +
        '<div class="section-head"><h2 class="section-title">From the lab</h2></div>' +
        '<div class="grid-3">' + afterToday.slice(0, 3).map(function (s) { return cardHTML(s); }).join('') + '</div></div></section>';
    }

    /* Around the world */
    var regional = stories.filter(function (s) { return s.region && s.region !== 'Global'; });
    if (regional.length >= 2) {
      html += '<section class="section"><div class="container">' +
        '<div class="section-head"><h2 class="section-title">Around the world</h2></div>' +
        '<div class="scroll-row">' + regional.slice(0, 8).map(function (s) { return cardHTML(s, { region: true }); }).join('') + '</div></div></section>';
    }

    /* The long view */
    var longevity = stories.filter(function (s) { return s.category === 'Longevity'; }).slice(0, 3);
    var mental = stories.filter(function (s) { return s.category === 'Mental Health'; }).slice(0, 3);
    if (longevity.length || mental.length) {
      function miniList(title, slug, items) {
        return '<div><div class="section-head"><h2 class="section-title" style="font-size:24px">' + title + '</h2>' +
          '<a href="category.html?cat=' + slug + '" style="font-size:13px">View all \u2192</a></div>' +
          '<div class="row-list">' + (items.length ? items.map(function (s) {
            return '<div class="row" style="grid-template-columns:1fr auto"><div><span class="cat-label">' + esc(s.subCategory || s.category) + '</span>' +
              '<h3 style="font-size:18px"><a href="' + storyUrl(s) + '">' + esc(s.headline) + '</a></h3></div>' +
              '<span class="impact"><span class="impact-dot"></span>' + esc(s.impact) + '/10</span></div>';
          }).join('') : '<p style="color:var(--text-muted);font-size:14px;padding:16px 0">Coverage begins soon.</p>') + '</div></div>';
      }
      html += '<section class="section"><div class="container">' +
        '<div class="section-head"><h2 class="section-title">The long view</h2></div>' +
        '<div class="grid-2">' + miniList('Longevity', 'longevity', longevity) + miniList('Mental Health', 'mental-health', mental) + '</div></div></section>';
    }

    /* Footer newsletter */
    html += '<section class="section"><div class="container">' + newsletterHTML('newsletter-footer') + '</div></section>';

    root.innerHTML = html;

    /* signal chips behaviour */
    var chipBar = document.getElementById('signal-chips');
    var listEl = document.getElementById('signal-list');
    if (chipBar && listEl) {
      var cats = ['All'].concat(CATEGORIES.map(function (c) { return c.name; })
        .filter(function (n) { return stories.some(function (s) { return s.category === n; }); }));
      chipBar.innerHTML = cats.map(function (c, i) {
        return '<button class="chip' + (i === 0 ? ' active' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('');
      function renderSignal(cat) {
        var items = stories.filter(function (s) { return cat === 'All' || s.category === cat; }).slice(0, 6);
        listEl.innerHTML = items.map(function (s) {
          return '<div class="row"><span class="row-rank">\u2192</span>' +
            '<div><span class="cat-label">' + esc(s.category) + '</span>' +
            '<h3><a href="' + storyUrl(s) + '">' + esc(s.headline) + '</a></h3>' +
            metaStrip(s) + '</div>' +
            '<span class="impact"><span class="impact-dot"></span>' + esc(s.impact) + '/10</span></div>';
        }).join('') || '<p style="color:var(--text-muted);padding:16px 0">No stories in this category yet.</p>';
      }
      chipBar.addEventListener('click', function (e) {
        var b = e.target.closest('.chip'); if (!b) return;
        chipBar.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
        b.classList.add('active');
        renderSignal(b.getAttribute('data-cat'));
      });
      renderSignal('All');
    }
  }

  /* ---------- page: story ---------- */
  function renderStory() {
    var stories = allStories();
    mountChrome(null, stories);
    var root = document.getElementById('page');
    var slug = new URLSearchParams(location.search).get('slug');
    var s = stories.filter(function (x) { return x.slug === slug; })[0];

    if (!s) {
      root.innerHTML = '<div class="container empty"><h2>Story not found</h2>' +
        '<p>This story may not be published yet, or the link is out of date.</p>' +
        '<a class="btn" href="index.html">Back to the homepage</a></div>';
      return;
    }

    document.title = s.headline + ' \u00B7 Lumen';
    if (s.metaDescription) {
      var m = document.querySelector('meta[name="description"]');
      if (m) m.setAttribute('content', s.metaDescription);
    }

    var related = stories.filter(function (x) { return x.slug !== s.slug && x.category === s.category; }).slice(0, 2);
    var elsewhere = stories.filter(function (x) { return x.slug !== s.slug && x.category !== s.category; }).slice(0, 1);

    var html = '<div class="progress-bar" id="progress"></div><div class="article-wrap">';
    html += '<p class="breadcrumb"><a href="index.html">Home</a> \u2192 <a href="category.html?cat=' + catSlug(s.category) + '">' + esc(s.category) + '</a> \u2192 ' + esc(s.slug) + '</p>';
    html += '<span class="cat-label">' + esc(s.category) + (s.subCategory ? ' \u00B7 ' + esc(s.subCategory) : '') + '</span>';
    html += '<h1 class="article-headline">' + esc(s.headline) + '</h1>';
    html += '<p class="article-lede">' + esc(s.lede) + '</p>';
    html += '<div class="article-meta-row"><div class="meta">' +
      '<span>\uD83D\uDEE1\uFE0F ' + esc(s.sourceType) + '</span><span class="sep"></span>' +
      '<span>' + fmtDate(s.publishDate) + '</span><span class="sep"></span>' +
      '<span>\u23F1 ' + esc(s.readTime || 3) + ' min read</span><span class="sep"></span>' +
      '<span class="impact"><span class="impact-dot"></span>Impact ' + esc(s.impact) + '/10</span></div>' +
      '<span class="badge">\u270D\uFE0F Human Written</span></div>';

    var readers = Number(s.readersToday) || 0;
    if (readers) html += '<p class="readers" style="margin-bottom:24px"><span class="up">\u2191</span> ' + num(readers) + ' people read this today</p>';

    if (s.heroImage) {
      html += '<figure><div class="article-hero"><img src="' + esc(s.heroImage) + '" alt="' + esc(s.imageCaption || s.headline) + '"></div>' +
        '<figcaption class="caption">' + esc(s.imageCaption || '') + (s.imageCredit ? ' \u00B7 ' + esc(s.imageCredit) : '') + '</figcaption></figure>';
    }

    html += '<div class="article-body">';
    if (s.whyItMatters) html += '<div class="why-matters"><strong>Why it matters \u2014</strong> ' + esc(s.whyItMatters) + '</div>';
    html += s.bodyHtml || '<p>' + esc(s.lede) + '</p>';
    if (s.pullQuote) {
      html += '<blockquote style="margin:32px 0">\u201C' + esc(s.pullQuote) + '\u201D' +
        '<p class="quote-attr">\u2014 ' + esc(s.pullQuoteAttribution || '') + '</p></blockquote>';
    }
    html += '</div>';

    if (s.videoUrl && /youtube\.com|youtu\.be/.test(s.videoUrl)) {
      var vid = (s.videoUrl.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/) || [])[1];
      if (vid) html += '<div style="aspect-ratio:16/9;border-radius:12px;overflow:hidden;margin:32px 0"><iframe width="100%" height="100%" src="https://www.youtube.com/embed/' + vid + '" frameborder="0" allowfullscreen title="Video"></iframe></div>';
    }

    html += '<div class="sponsored"><span class="tag">Sponsored</span>Leaderboard ad slot</div>';

    /* Data box */
    html += '<div class="data-box"><h4>The data</h4><table>' +
      (s.trialPhase ? '<tr><td>Trial phase</td><td>' + esc(s.trialPhase) + '</td></tr>' : '') +
      (s.patientN ? '<tr><td>Patients (n)</td><td>' + num(s.patientN) + '</td></tr>' : '') +
      (s.effectSize ? '<tr><td>Effect size (absolute)</td><td>' + esc(s.effectSize) + '</td></tr>' : '') +
      (s.diseaseBurden ? '<tr><td>Disease burden</td><td>' + esc(s.diseaseBurden) + '</td></tr>' : '') +
      (s.nctId ? '<tr><td>Registration</td><td><a href="https://clinicaltrials.gov/study/' + esc(s.nctId) + '" rel="noopener" target="_blank">' + esc(s.nctId) + '</a></td></tr>' : '') +
      '</table></div>';

    /* Source line */
    html += '<p class="source-line">Source: ' + (s.journalUrl ? '<a href="' + esc(s.journalUrl) + '" rel="noopener" target="_blank">' + esc(s.journal) + '</a>' : esc(s.journal || '')) +
      ' \u00B7 ' + esc(s.author || 'Lumen Editorial') + ' \u00B7 ' + fmtDate(s.publishDate) + '</p>';

    /* Verification panel */
    html += '<details class="verify-panel"><summary>\uD83D\uDEE1\uFE0F How we verified this</summary><div class="verify-body"><dl>' +
      '<dt>Source</dt><dd>' + esc(s.sourceType) + (s.journal ? ' \u00B7 ' + esc(s.journal) : '') + '</dd>' +
      (s.trialPhase ? '<dt>Trial phase</dt><dd>' + esc(s.trialPhase) + (s.nctId ? ' \u00B7 <a href="https://clinicaltrials.gov/study/' + esc(s.nctId) + '" rel="noopener" target="_blank">ClinicalTrials.gov ' + esc(s.nctId) + '</a>' : '') + '</dd>' : '') +
      '<dt>Lumen\u2019s five-point filter</dt><dd>Every Lumen story must pass checks on source tier, trial phase, reported patient numbers, absolute effect size, and disease burden before publishing.</dd>' +
      (s.journalUrl ? '<dd style="margin-top:12px"><a href="' + esc(s.journalUrl) + '" rel="noopener" target="_blank">View primary source \u2192</a></dd>' : '') +
      '</dl></div></details>';

    /* Reactions */
    html += '<div class="reactions">' + REACTIONS.map(function (r) {
      var c = (s.reactions && s.reactions[r.key]) || 0;
      return '<button class="reaction" data-react="' + r.key + '">' + r.emoji + ' ' + r.label + ' <span class="count">' + num(c) + '</span></button>';
    }).join('') + '</div>';
    html += '<p class="reaction-note" id="react-note">Sign in to react. Reader accounts are coming soon.</p>';

    /* Related */
    if (related.length || elsewhere.length) {
      html += '<div class="related">';
      if (related.length) html += '<h2>More in ' + esc(s.category) + '</h2><div class="grid-2" style="gap:24px">' + related.map(function (x) { return cardHTML(x); }).join('') + '</div>';
      if (elsewhere.length) html += '<h2 style="margin-top:32px">From a different field</h2><div class="grid-2" style="gap:24px">' + elsewhere.map(function (x) { return cardHTML(x); }).join('') + '</div>';
      html += '</div>';
    }

    html += '<div style="margin-top:56px">' + newsletterHTML('newsletter') + '</div>';
    html += '<p class="caption" style="margin-top:24px"><a href="corrections.html">See correction history</a></p>';
    html += '</div>';

    root.innerHTML = html;

    /* progress bar */
    var bar = document.getElementById('progress');
    window.addEventListener('scroll', function () {
      var h = document.documentElement;
      var pct = h.scrollTop / (h.scrollHeight - h.clientHeight) * 100;
      bar.style.width = pct + '%';
    }, { passive: true });

    /* reactions need sign-in */
    root.addEventListener('click', function (e) {
      if (e.target.closest('.reaction')) {
        var note = document.getElementById('react-note');
        note.textContent = 'Reactions need a reader account \u2014 accounts are coming soon. Counts shown are site-wide.';
      }
    });
  }

  /* ---------- page: category ---------- */
  function renderCategory() {
    var stories = allStories();
    var params = new URLSearchParams(location.search);
    var slug = params.get('cat') || 'medicine';
    var cat = CATEGORIES.filter(function (c) { return c.slug === slug; })[0] || CATEGORIES[0];
    mountChrome(cat.slug, stories);
    document.title = cat.name + ' \u00B7 Lumen';

    var root = document.getElementById('page');
    var impactMin = parseInt(params.get('impact') || '0', 10) || 0;
    var inCat = stories.filter(function (s) { return s.category === cat.name; });

    var filters = [
      { label: 'All stories', v: 0 }, { label: 'Impact 7+', v: 7 },
      { label: 'Impact 8+', v: 8 }, { label: 'Impact 9+', v: 9 }, { label: 'Impact 10 only', v: 10 }
    ];

    var html = '<div class="container">' +
      '<header class="cat-header"><span class="cat-label">Section</span><h1>' + esc(cat.name) + '</h1>' +
      '<p class="summary">' + esc(cat.summary) + '</p>' +
      '<p class="stat">' + esc(cat.stat) + ' \u00B7 ' + inCat.length + ' ' + (inCat.length === 1 ? 'story' : 'stories') + '</p></header>' +
      '<div class="filter-bar"><span class="label">Filter by impact</span>' +
      filters.map(function (f) {
        return '<a class="chip' + (impactMin === f.v ? ' active' : '') + '" href="category.html?cat=' + cat.slug + (f.v ? '&impact=' + f.v : '') + '">' + f.label + '</a>';
      }).join('') +
      '<button class="chip" id="follow-btn" style="margin-left:auto">Follow this topic</button></div>';

    var visible = inCat.filter(function (s) { return Number(s.impact) >= impactMin; });
    if (visible.length) {
      html += '<div class="grid-2" style="margin-bottom:64px">' + visible.map(function (s) { return cardHTML(s); }).join('') + '</div>';
    } else {
      html += '<div class="empty" style="padding:64px 0"><h2 style="font-size:26px">' +
        (inCat.length ? 'No stories at this impact level yet.' : 'No ' + esc(cat.name) + ' stories yet.') + '</h2>' +
        '<p>' + (inCat.length ? 'Lower the impact filter to see all coverage in this section.' : 'New stories are published daily \u2014 this section fills as soon as something clears Lumen\u2019s five-point filter.') + '</p></div>';
    }

    html += newsletterHTML('newsletter') + '<div style="height:64px"></div></div>';
    root.innerHTML = html;

    var follow = document.getElementById('follow-btn');
    follow.addEventListener('click', function () {
      try {
        var prefs = JSON.parse(localStorage.getItem('lumen_follows') || '[]');
        if (prefs.indexOf(cat.name) === -1) prefs.push(cat.name);
        localStorage.setItem('lumen_follows', JSON.stringify(prefs));
      } catch (e) {}
      follow.textContent = 'Following \u2713';
      follow.classList.add('active');
    });
  }

  /* ---------- page: corrections ---------- */
  function renderCorrections() {
    var stories = allStories();
    mountChrome(null, stories);
    document.title = 'Correction log \u00B7 Lumen';
    var root = document.getElementById('page');
    var corrections = (window.LUMEN_DATA && window.LUMEN_DATA.corrections) || [];
    try {
      JSON.parse(localStorage.getItem('lumen_local_corrections') || '[]').forEach(function (c) {
        if (hasAdminSession()) corrections.push(c);
      });
    } catch (e) {}
    corrections.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

    var html = '<div class="container"><header class="cat-header"><span class="cat-label">Trust</span>' +
      '<h1>Correction log</h1><p class="summary">A public, timestamped record of every correction made to a published Lumen story \u2014 updated within 24 hours of any change. Editorial standards only count if you can see them enforced.</p></header>';

    if (corrections.length) {
      html += corrections.map(function (c) {
        var s = stories.filter(function (x) { return x.slug === c.slug; })[0];
        return '<div class="correction-row"><span class="date">' + fmtDate(c.date) + '</span>' +
          '<h3 style="font-size:19px;margin:4px 0">' + (s ? '<a href="' + storyUrl(s) + '">' + esc(s.headline) + '</a>' : esc(c.headline || c.slug)) + '</h3>' +
          '<p style="font-size:15px"><strong>What changed:</strong> ' + esc(c.what) + '</p>' +
          (c.why ? '<p style="font-size:15px;color:var(--text-muted)"><strong>Why:</strong> ' + esc(c.why) + '</p>' : '') + '</div>';
      }).join('');
    } else {
      html += '<div class="empty" style="padding:64px 0"><h2 style="font-size:26px">No corrections yet.</h2>' +
        '<p>When a published story is corrected, the full record appears here.</p></div>';
    }
    html += '<div style="height:80px"></div></div>';
    root.innerHTML = html;
  }

  /* ---------- boot ---------- */
  window.LUMEN = {
    CATEGORIES: CATEGORIES, REACTIONS: REACTIONS,
    allStories: allStories, esc: esc, fmtDate: fmtDate,
    renderHome: renderHome, renderStory: renderStory,
    renderCategory: renderCategory, renderCorrections: renderCorrections
  };
})();
