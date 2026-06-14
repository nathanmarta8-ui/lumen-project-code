/* ============================================================
   LUMEN — shared front-end logic v2
   Bento homepage, article, category, corrections, about, privacy
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------
     CONFIG — site owner settings. Pick ONE newsletter mode:

     A) Form-action provider (Kit / ConvertKit — recommended):
        Kit dashboard → Grow → Landing Pages & Forms → create an
        Inline form → Publish → HTML embed. In the snippet, find
        <form action="https://app.kit.com/forms/XXXXXXX/subscriptions" ...>
        and paste that action URL into newsletterFormAction below.
        Lumen renders its own styled form and posts to Kit.

     B) Iframe provider (e.g. Beehiiv): paste the iframe src URL
        into newsletterEmbedUrl instead.

     Leave both '' to show the local placeholder form.
  ------------------------------------------------------------ */
  var CONFIG = {
    newsletterFormAction: '',
    newsletterEmailField: 'email_address',
    newsletterEmbedUrl: '',
    siteUrl: 'https://readlumen.site'
  };

  var CATEGORIES = [
    { name: 'Medicine',       slug: 'medicine',       summary: 'Approvals, scale milestones and trial results at the inflection point — the moment research becomes treatment.', stat: 'Tracking the moments care actually changes' },
    { name: 'Biotechnology',  slug: 'biotechnology',  summary: 'Gene therapy, CRISPR and synthetic biology, covered at mechanism level — and only with human data.', stat: 'Human data required, always' },
    { name: 'Health Tech',    slug: 'health-tech',    summary: 'AI diagnostics, wearables, devices and surgical robotics — only where they change a clinical outcome, not just a process.', stat: 'Outcome data or it doesn\u2019t run' },
    { name: 'Brain Science',  slug: 'brain-science',  summary: 'BCIs, mental health trials, neurodegeneration and neuroplasticity, handled with the highest editorial care.', stat: 'Highest stakes, highest bar' },
    { name: 'Longevity',      slug: 'longevity',      summary: 'Senolytics, reprogramming and cognitive longevity — validated biological age metrics only, never proprietary scores.', stat: 'Validated ageing metrics only' },
    { name: 'Global Health',  slug: 'global-health',  summary: 'Health interventions at scale in low- and middle-income countries, always with the access and equity angle.', stat: 'Coverage beyond the usual borders' },
    { name: 'Mental Health',  slug: 'mental-health',  summary: 'Treatment trials, digital mental health and solutions to the access gap.', stat: 'Signal over stigma' }
  ];

  var REACTIONS = [
    { key: 'fascinating', icon: 'microscope', label: 'Fascinating' },
    { key: 'important',   icon: 'spark',      label: 'Important' },
    { key: 'global',      icon: 'globe',      label: 'Global impact' },
    { key: 'hope',        icon: 'heart',      label: 'Gives me hope' },
    { key: 'share',       icon: 'share',      label: 'Share-worthy' }
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
  /* headline helpers: ==word== renders highlighted in lead/article */
  function plainHead(h) { return String(h || '').replace(/==/g, ''); }
  function hlHead(h) {
    var safe = esc(h);
    var out = '', open = false, parts = safe.split('==');
    for (var i = 0; i < parts.length; i++) {
      out += parts[i];
      if (i < parts.length - 1) { out += open ? '</mark>' : '<mark class="hl">'; open = !open; }
    }
    if (open) out += '</mark>';
    return out;
  }
  function catSlug(name) {
    var c = CATEGORIES.filter(function (c) { return c.name === name; })[0];
    return c ? c.slug : 'medicine';
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function num(n) { return Number(n || 0).toLocaleString('en-US'); }

  /* author display: masthead placeholders ("Lumen …") show as the named publisher */
  function realAuthor(s) {
    var a = ((s && s.author) || '').trim();
    return (!a || a.toLowerCase().indexOf('lumen') === 0) ? 'Nathan Stanley Martanegara' : a;
  }

  /* slug hygiene: a data-entry slug like "/story/foo" or "foo/" can't break URLs */
  function cleanSlug(s) {
    return String(s == null ? '' : s).split('?')[0].split('#')[0]
      .split('/').filter(Boolean).pop() || '';
  }
  /* canonical clean URL per story */
  function storyUrl(s) { return '/story/' + encodeURIComponent(cleanSlug(s.slug)); }
  function storyPath(slug) { return '/story/' + encodeURIComponent(cleanSlug(slug)); }

  /* inline line-icons (1.5px stroke, currentColor) — no emoji, no dependency */
  var ICONS = {
    search:     '<path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5"/>',
    arrow:      '<path d="M5 12h14M13 6l6 6-6 6"/>',
    microscope: '<path d="M6 18h12M9 18V8a3 3 0 0 1 6 0M8 21h8M12 4v1"/>',
    spark:      '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
    globe:      '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/>',
    heart:      '<path d="M12 20s-7-4.4-7-9.5A3.5 3.5 0 0 1 12 7a3.5 3.5 0 0 1 7 3.5C19 15.6 12 20 12 20z"/>',
    share:      '<path d="M12 16V4M8 8l4-4 4 4M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/>'
  };
  function icon(name, size) {
    var s = size || 16;
    return '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || '') + '</svg>';
  }

  /* strip paste cruft (inline styles, Word/Pages classes, empty spans) from body HTML;
     keep only semantic structure. Runs in-browser via a detached element. */
  function sanitizeBody(htmlStr) {
    if (!htmlStr) return '';
    var allow = { P: 1, BR: 1, STRONG: 1, B: 1, EM: 1, I: 1, A: 1, UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1, H2: 1, H3: 1 };
    var box = document.createElement('div');
    box.innerHTML = htmlStr;
    (function walk(node) {
      var kids = Array.prototype.slice.call(node.childNodes);
      kids.forEach(function (n) {
        if (n.nodeType === 1) {
          walk(n);
          if (!allow[n.tagName]) {
            while (n.firstChild) node.insertBefore(n.firstChild, n);
            node.removeChild(n);
            return;
          }
          var keep = (n.tagName === 'A') ? ['href'] : [];
          Array.prototype.slice.call(n.attributes).forEach(function (a) {
            if (keep.indexOf(a.name) === -1) n.removeAttribute(a.name);
          });
          if (n.tagName === 'A') { n.setAttribute('rel', 'noopener'); }
        }
      });
    })(box);
    return box.innerHTML;
  }

  function metaStrip(s, short) {
    return '<div class="meta">' +
      '<span class="src-tag">' + esc(s.sourceType || 'Peer-reviewed') + '</span>' +
      (!short && s.journal ? '<span class="sep"></span><span>' + esc(s.journal) + '</span>' : '') +
      '<span class="sep"></span><span>' + esc(s.readTime || 3) + ' min read</span>' +
      '<span class="sep"></span><span class="impact"><span class="impact-dot"></span>' + esc(s.impact) + '/10</span>' +
      '</div>';
  }

  /* ---------- newsletter ---------- */
  function newsletterFormHTML() {
    if (CONFIG.newsletterFormAction) {
      return '<form class="newsletter-form" action="' + esc(CONFIG.newsletterFormAction) + '" method="post" target="_blank" rel="noopener">' +
        '<input type="email" name="' + esc(CONFIG.newsletterEmailField || 'email_address') + '" required placeholder="you@example.com" aria-label="Email address">' +
        '<button class="btn" type="submit">Get the signal \u2192</button></form>' +
        '<p class="proof">Confirmation opens in a new tab. No spam. Unsubscribe anytime.</p>';
    }
    if (CONFIG.newsletterEmbedUrl) {
      return '<iframe class="nl-embed" src="' + esc(CONFIG.newsletterEmbedUrl) + '" title="Subscribe to the Lumen newsletter" loading="lazy"></iframe>';
    }
    return '<form class="newsletter-form" data-newsletter>' +
      '<input type="email" required placeholder="you@example.com" aria-label="Email address">' +
      '<button class="btn" type="submit">Get the signal \u2192</button></form>' +
      '<p class="proof">No spam. Unsubscribe anytime.</p>';
  }
  function newsletterBannerHTML(id) {
    return '<div class="newsletter reveal" id="' + (id || 'newsletter') + '">' +
      '<h2>Understand the future in 5 minutes.</h2>' +
      '<p class="sub">Tuesday and Friday. No noise. No hype.</p>' +
      newsletterFormHTML() + '</div>';
  }
  function newsletterTileHTML() {
    return '<div class="tile-news reveal" id="newsletter">' +
      '<span class="cat-label">The newsletter</span>' +
      '<h3>Understand the future in 5 minutes.</h3>' +
      '<p>Tuesday and Friday. No noise. No hype. Every story pre-cleared by our five-point evidence filter.</p>' +
      newsletterFormHTML() +
      '<span class="nl-meta">Free \u00B7 2\u00D7 weekly</span></div>';
  }

  /* ---------- cards ---------- */
  function imgCardHTML(s, cls) {
    return '<article class="panel card-img ' + (cls || '') + ' reveal">' +
      (s.heroImage ? '<a class="thumb" href="' + storyUrl(s) + '"><img src="' + esc(s.heroImage) + '" alt="' + esc(s.imageCaption || plainHead(s.headline)) + '" loading="lazy"></a>' : '') +
      '<div class="card-pad">' +
      '<span class="cat-label">' + esc(s.category) + '</span>' +
      '<h3><a class="uline" href="' + storyUrl(s) + '">' + esc(plainHead(s.headline)) + '</a></h3>' +
      '<div class="card-foot">' + metaStrip(s, true) +
      '<a href="' + storyUrl(s) + '" aria-label="Read story"><span class="arrow-btn">\u2192</span></a></div>' +
      '</div></article>';
  }
  function textCardHTML(s) {
    return '<article class="panel card-text reveal">' +
      '<span class="cat-label">' + esc(s.category) + '</span>' +
      '<h3><a class="uline" href="' + storyUrl(s) + '">' + esc(plainHead(s.headline)) + '</a></h3>' +
      '<p class="lede">' + esc(s.lede) + '</p>' +
      '<div class="card-foot">' + metaStrip(s, true) +
      '<a href="' + storyUrl(s) + '" aria-label="Read story"><span class="arrow-btn">\u2192</span></a></div>' +
      '</article>';
  }
  function compactCardHTML(s) {
    return '<article class="panel card-compact reveal">' +
      (s.heroImage ? '<a class="thumb" href="' + storyUrl(s) + '"><img src="' + esc(s.heroImage) + '" alt="" loading="lazy"></a>' : '') +
      '<div class="card-pad">' +
      '<span class="cat-label">' + esc(s.category) + '</span>' +
      '<h3><a href="' + storyUrl(s) + '">' + esc(plainHead(s.headline)) + '</a></h3>' +
      metaStrip(s, true) +
      '</div></article>';
  }
  function dataTileHTML(value, label, href, up, prefix, raw) {
    var inner = '<span class="v"' + (raw != null ? ' data-count="' + raw + '" data-prefix="' + (prefix || '') + '"' : '') + '>' + esc(value) + (up ? ' <span class="up">\u2191</span>' : '') + '</span>' +
      '<span class="l">' + esc(label) + '</span>';
    return '<div class="tile-data reveal">' + (href ? '<a href="' + href + '">' + inner + '</a>' : inner) + '</div>';
  }

  /* ---------- chrome ---------- */
  function navHTML(active) {
    var links = CATEGORIES.map(function (c) {
      var cur = active === c.slug ? ' aria-current="page"' : '';
      return '<a href="category.html?cat=' + c.slug + '"' + cur + '>' + c.name + '</a>';
    }).join('');
    return '<nav class="nav" id="site-nav"><div class="nav-inner">' +
      '<a class="nav-logo" href="index.html">Lumen</a>' +
      '<div class="nav-links">' + links + '</div>' +
      '<div class="nav-right">' +
      '<button class="nav-search" id="open-search" aria-label="Search stories" title="Search ( / )">' + icon('search') + '</button>' +
      '<a class="btn btn-sm" href="#newsletter">Newsletter</a>' +
      '<a class="nav-signin" href="#newsletter">Subscribe</a>' +
      '</div></div></nav>';
  }
  function tickerHTML(stories) {
    var items = stories.filter(function (s) { return s.breaking; });
    if (!items.length) items = stories.slice(0, 6);
    if (!items.length) return '';
    var links = items.map(function (s) {
      return '<a href="' + storyUrl(s) + '">' + esc(plainHead(s.headline)) + '</a>';
    }).join('<span class="ticker-sep">|</span>');
    return '<div class="ticker" aria-label="Breaking news">' +
      '<span class="ticker-label">Signal</span>' +
      '<div class="ticker-track">' + links + '<span class="ticker-sep">|</span>' + links + '</div></div>';
  }
  function footerHTML() {
    var year = new Date().getFullYear();
    return '<footer class="site-footer"><div class="container">' +
      '<div class="footer-grid">' +
      '<div><span class="footer-logo">Lumen</span><p class="footer-mission">Breakthroughs brought to light. The world\u2019s most important medical and technological advances, translated into clear, human stories.</p></div>' +
      '<div><h4>Sections</h4>' + CATEGORIES.slice(0, 4).map(function (c) { return '<a href="category.html?cat=' + c.slug + '">' + c.name + '</a>'; }).join('') + '</div>' +
      '<div><h4>More</h4>' + CATEGORIES.slice(4).map(function (c) { return '<a href="category.html?cat=' + c.slug + '">' + c.name + '</a>'; }).join('') + '</div>' +
      '<div><h4>Lumen</h4><a href="about.html">About & standards</a><a href="corrections.html">Correction log</a><a href="privacy.html">Privacy</a><a href="#newsletter">Newsletter</a><a href="/feed.xml">RSS feed</a></div>' +
      '</div>' +
      '<div class="footer-bottom"><span>\u00A9 ' + year + ' Lumen \u00B7 readlumen.site</span>' +
      '<span>Lumen is journalism, not medical advice. Always consult a qualified clinician.</span></div>' +
      '</div></footer>';
  }

  function mountChrome(active, stories) {
    var chrome = document.getElementById('chrome');
    if (chrome) {
      var note = '';
      if (stories && stories._localCount) {
        note = '<div class="preview-note">Previewing ' + stories._localCount +
          ' locally published ' + (stories._localCount === 1 ? 'story' : 'stories') +
          ' (visible only to you). Download <strong>stories.js</strong> from <a href="admin.html">Admin</a> and redeploy to publish for everyone.</div>';
      }
      chrome.innerHTML = navHTML(active) + (stories ? tickerHTML(stories) : '') + note;
    }
    var foot = document.getElementById('site-footer');
    if (foot) foot.innerHTML = footerHTML();

    /* nav shadow on scroll */
    var nav = document.getElementById('site-nav');
    if (nav) {
      var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    /* ---------- instant search ---------- */
    if (!document.getElementById('search-overlay')) {
      var ov = document.createElement('div');
      ov.className = 'search-overlay'; ov.id = 'search-overlay';
      ov.innerHTML = '<div class="search-box" role="dialog" aria-label="Search stories">' +
        '<input type="search" id="search-input" placeholder="Search stories, topics, journals\u2026" autocomplete="off">' +
        '<div class="search-results" id="search-results"></div>' +
        '<div class="search-hint"><span><kbd>\u2191\u2193</kbd> navigate</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div></div>';
      document.body.appendChild(ov);

      var corpus = allStories();
      var input = ov.querySelector('#search-input');
      var resBox = ov.querySelector('#search-results');
      var sel = -1;

      function openSearch() {
        ov.classList.add('open');
        input.value = ''; runSearch('');
        setTimeout(function () { input.focus(); }, 30);
      }
      function closeSearch() { ov.classList.remove('open'); }
      function runSearch(q) {
        sel = -1;
        q = q.trim().toLowerCase();
        if (!q) {
          resBox.innerHTML = '<div class="search-empty">Start typing \u2014 every published story is searchable by headline, topic, or journal.</div>';
          return;
        }
        var hits = corpus.map(function (s) {
          var head = plainHead(s.headline).toLowerCase();
          var hay = head + ' ' + (s.lede || '').toLowerCase() + ' ' + (s.category || '').toLowerCase() + ' ' + (s.journal || '').toLowerCase() + ' ' + (s.subCategory || '').toLowerCase();
          var score = head.indexOf(q) >= 0 ? 2 : (hay.indexOf(q) >= 0 ? 1 : 0);
          return { s: s, score: score };
        }).filter(function (h) { return h.score > 0; })
          .sort(function (a, b) { return b.score - a.score || new Date(b.s.publishDate) - new Date(a.s.publishDate); })
          .slice(0, 8);
        resBox.innerHTML = hits.length ? hits.map(function (h) {
          return '<a href="' + storyUrl(h.s) + '"><span class="sr-cat">' + esc(h.s.category) + '</span>' +
            '<div class="sr-head">' + esc(plainHead(h.s.headline)) + '</div>' +
            '<span class="sr-meta">' + esc(h.s.journal || '') + ' \u00B7 ' + fmtDate(h.s.publishDate) + '</span></a>';
        }).join('') : '<div class="search-empty">No stories match \u201C' + esc(q) + '\u201D yet.</div>';
      }
      input.addEventListener('input', function () { runSearch(input.value); });
      input.addEventListener('keydown', function (e) {
        var links = resBox.querySelectorAll('a');
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (!links.length) return;
          sel = e.key === 'ArrowDown' ? Math.min(sel + 1, links.length - 1) : Math.max(sel - 1, 0);
          links.forEach(function (l, i) { l.classList.toggle('sel', i === sel); });
          links[sel].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter' && links.length) {
          location.href = links[Math.max(sel, 0)].getAttribute('href');
        }
      });
      ov.addEventListener('click', function (e) { if (e.target === ov) closeSearch(); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeSearch();
        if (e.key === '/' && !ov.classList.contains('open')) {
          var t = document.activeElement;
          if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
          e.preventDefault(); openSearch();
        }
      });
      document.addEventListener('click', function (e) {
        if (e.target.closest('#open-search')) openSearch();
      });
    }

    /* newsletter placeholder form handler */
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

  function countUp(el) {
    if (el._counted) return;
    el._counted = true;
    var target = Number(el.getAttribute('data-count'));
    var prefix = el.getAttribute('data-prefix') || '';
    var up = el.querySelector('.up');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !target) { return; }
    var dur = 1100, start = null;
    function frame(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = Math.round(target * eased);
      el.firstChild.nodeValue = prefix + val.toLocaleString('en-US') + (up ? ' ' : '');
      if (p < 1) requestAnimationFrame(frame);
      else el.firstChild.nodeValue = prefix + target.toLocaleString('en-US') + (up ? ' ' : '');
    }
    requestAnimationFrame(frame);
  }

  /* scroll reveal */
  function initReveal() {
    var els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('in'); });
      document.querySelectorAll('.tile-data .v[data-count]').forEach(countUp);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          en.target.querySelectorAll && en.target.querySelectorAll('.v[data-count]').forEach(countUp);
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    els.forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i % 6, 4) * 60 + 'ms';
      io.observe(el);
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
        '<div style="max-width:560px;margin:0 auto">' + newsletterBannerHTML() + '</div></div>';
      initReveal();
      return;
    }

    var hero = stories.filter(function (s) { return s.featured; })[0] || stories[0];
    var rest = stories.filter(function (s) { return s !== hero; });
    var secondary = rest[0];
    var textStory = rest[1];
    var gridRest = rest.slice(2);

    /* hero rotation pool: featured + breaking, hero first, capped at 5 */
    var pool = [hero];
    stories.forEach(function (s) {
      if (s !== hero && (s.featured || s.breaking) && pool.length < 5) pool.push(s);
    });
    if (pool.length < 2) {
      stories.forEach(function (s) { if (s !== hero && pool.length < 4) pool.push(s); });
    }

    function leadInner(s) {
      return (s.heroImage ? '<a class="lead-img" href="' + storyUrl(s) + '"><img src="' + esc(s.heroImage) + '" alt="' + esc(s.imageCaption || plainHead(s.headline)) + '" id="lead-zoom"></a>' : '') +
        '<div class="lead-body">' +
        '<span class="cat-label">' + esc(s.category) + (s.featured ? ' \u00B7 Lead story' : (s.breaking ? ' \u00B7 Breaking' : '')) + '</span>' +
        '<h1><a href="' + storyUrl(s) + '">' + hlHead(s.headline) + '</a></h1>' +
        '<p class="lede">' + esc(s.lede) + '</p>' +
        '<div class="lead-foot">' + metaStrip(s) +
        '<a class="btn btn-sm" href="' + storyUrl(s) + '">Read the breakthrough \u2192</a></div>' +
        '</div>';
    }

    var html = '<div class="container board">';

    /* bento */
    html += '<section class="bento">';
    var dots = pool.length > 1 ? '<div class="lead-dots" id="lead-dots">' + pool.map(function (_, i) {
      return '<button class="lead-dot' + (i === 0 ? ' on' : '') + '" data-i="' + i + '" aria-label="Lead story ' + (i + 1) + '"></button>';
    }).join('') + '</div>' : '';
    html += '<article class="panel lead reveal" id="lead-panel">' +
      '<div class="lead-progress" id="lead-progress"></div>' +
      '<div class="lead-fade" id="lead-fade">' + leadInner(hero) + '</div>' +
      (dots ? '<div style="padding:0 30px 18px;margin-top:-6px">' + dots + '</div>' : '') +
      '</article>';

    html += '<div class="side">';
    if (secondary) html += imgCardHTML(secondary, 'secondary');
    html += '<div class="side-row">' +
      (textStory ? textCardHTML(textStory) : '') +
      newsletterTileHTML() +
      '</div>';
    html += '</div></section>';

    /* data tiles */
    var tiles = [];
    stories.forEach(function (s) {
      if (tiles.length < 3 && Number(s.patientN) > 0) {
        tiles.push(dataTileHTML('n=' + num(s.patientN),
          (s.trialPhase && s.trialPhase !== 'N/A' ? s.trialPhase + ' \u00B7 ' : '') + (s.journal || s.category),
          storyUrl(s), true, 'n=', Number(s.patientN)));
      }
    });
    var corrCount = ((window.LUMEN_DATA && window.LUMEN_DATA.corrections) || []).length;
    tiles.push(dataTileHTML(String(corrCount), corrCount === 1 ? 'correction \u00B7 full public log' : 'corrections \u00B7 full public log', 'corrections.html', false, '', corrCount));
    if (tiles.length >= 2) html += '<div class="tile-strip">' + tiles.join('') + '</div>';

    /* personalized: because you follow ... */
    var follows = [];
    try { follows = JSON.parse(localStorage.getItem('lumen_follows') || '[]'); } catch (e) {}
    if (follows.length) {
      var followed = stories.filter(function (s) { return follows.indexOf(s.category) >= 0 && s !== hero; }).slice(0, 3);
      if (followed.length) {
        html += '<section class="section" style="padding-top:48px"><div class="section-head reveal" style="margin-bottom:18px">' +
          '<h2 class="section-title" style="font-size:22px">Because you follow ' + esc(follows.slice(0, 2).join(' & ')) + '</h2>' +
          '<a class="follow-note" href="' + 'category.html?cat=' + catSlug(followed[0].category) + '">Manage topics \u2192</a></div>' +
          '<div class="compact-grid" style="margin-top:0">' + followed.map(compactCardHTML).join('') + '</div></section>';
      }
    }

    /* remaining stories: compact grid */
    if (gridRest.length) {
      html += '<div class="compact-grid">' + gridRest.map(compactCardHTML).join('') + '</div>';
    }
    html += '<div class="ad-slot" data-slot="home-grid"></div>';
    html += '</div>'; /* /board container */

    /* this week's signal */
    html += '<section class="section"><div class="container">' +
      '<div class="section-head reveal"><h2 class="section-title">This week\u2019s signal</h2>' +
      '<span class="section-date">' + fmtDate(new Date().toISOString()) + '</span></div>' +
      '<div class="chip-bar reveal" id="signal-chips"></div><div class="row-list" id="signal-list"></div></div></section>';

    /* human impact */
    var quoted = stories.filter(function (s) { return s.pullQuote; })[0];
    if (quoted) {
      html += '<section class="section"><div class="container"><div class="human-impact reveal">' +
        (quoted.heroImage ? '<div class="hi-img"><img src="' + esc(quoted.heroImage) + '" alt="" loading="lazy"></div>' : '<div></div>') +
        '<div><span class="cat-label">Human impact</span>' +
        '<blockquote>\u201C' + esc(quoted.pullQuote) + '\u201D</blockquote>' +
        '<p class="quote-attr">\u2014 ' + esc(quoted.pullQuoteAttribution || '') + '</p>' +
        '<p style="margin-top:16px"><a class="uline" href="' + storyUrl(quoted) + '">Read the full story \u2192</a></p>' +
        '</div></div></div></section>';
    }

    /* around the world */
    var regional = stories.filter(function (s) { return s.region && s.region !== 'Global'; });
    if (regional.length >= 2) {
      html += '<section class="section"><div class="container">' +
        '<div class="section-head reveal"><h2 class="section-title">Around the world</h2></div>' +
        '<div class="scroll-row">' + regional.slice(0, 8).map(function (s) {
          return '<article class="panel card-img reveal">' +
            (s.heroImage ? '<a class="thumb" href="' + storyUrl(s) + '"><img src="' + esc(s.heroImage) + '" alt="" loading="lazy"></a>' : '') +
            '<div class="card-pad"><span class="region-tag">' + esc(s.region) + '</span>' +
            '<span class="cat-label">' + esc(s.category) + '</span>' +
            '<h3><a class="uline" href="' + storyUrl(s) + '">' + esc(plainHead(s.headline)) + '</a></h3>' +
            metaStrip(s, true) + '</div></article>';
        }).join('') + '</div></div></section>';
    }

    /* the long view */
    var longevity = stories.filter(function (s) { return s.category === 'Longevity'; }).slice(0, 3);
    var mental = stories.filter(function (s) { return s.category === 'Mental Health'; }).slice(0, 3);
    if (longevity.length || mental.length) {
      function miniList(title, slug, items) {
        return '<div class="reveal"><div class="section-head"><h2 class="section-title" style="font-size:24px">' + title + '</h2>' +
          '<a class="uline" href="category.html?cat=' + slug + '" style="font-size:13px">View all \u2192</a></div>' +
          '<div class="row-list">' + (items.length ? items.map(function (s) {
            return '<div class="row" style="grid-template-columns:1fr auto"><div><span class="cat-label">' + esc(s.subCategory || s.category) + '</span>' +
              '<h3 style="font-size:18px"><a href="' + storyUrl(s) + '">' + esc(plainHead(s.headline)) + '</a></h3></div>' +
              '<span class="impact"><span class="impact-dot"></span>' + esc(s.impact) + '/10</span></div>';
          }).join('') : '<p style="color:var(--text-muted);font-size:14px;padding:16px 0">Coverage begins soon.</p>') + '</div></div>';
      }
      html += '<section class="section"><div class="container">' +
        '<div class="section-head reveal"><h2 class="section-title">The long view</h2></div>' +
        '<div class="grid-2">' + miniList('Longevity', 'longevity', longevity) + miniList('Mental Health', 'mental-health', mental) + '</div></div></section>';
    }

    html += '<section class="section"><div class="container">' + newsletterBannerHTML('newsletter-footer') + '</div></section>';
    root.innerHTML = html;

    /* hero rotation */
    (function () {
      var panel = document.getElementById('lead-panel');
      if (!panel || pool.length < 2) {
        var lz0 = document.getElementById('lead-zoom');
        if (lz0) setTimeout(function () { lz0.style.transform = 'scale(1.04)'; }, 400);
        return;
      }
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var fade = document.getElementById('lead-fade');
      var bar = document.getElementById('lead-progress');
      var dotEls = panel.querySelectorAll('.lead-dot');
      var cur = 0, timer = null, DURATION = 8000;

      function paint(i) {
        fade.classList.add('out');
        setTimeout(function () {
          fade.innerHTML = leadInner(pool[i]);
          fade.classList.remove('out');
          var lz = document.getElementById('lead-zoom');
          if (lz) setTimeout(function () { lz.style.transform = 'scale(1.04)'; }, 300);
        }, 350);
        dotEls.forEach(function (d, di) { d.classList.toggle('on', di === i); });
        cur = i;
      }
      function startBar() {
        if (reduce) return;
        bar.classList.remove('run'); bar.style.width = '0';
        void bar.offsetWidth;
        bar.classList.add('run'); bar.style.transitionDuration = DURATION + 'ms';
        bar.style.width = '100%';
      }
      function next() { paint((cur + 1) % pool.length); startBar(); }
      function play() { if (reduce) return; stop(); timer = setInterval(next, DURATION); startBar(); }
      function stop() { if (timer) { clearInterval(timer); timer = null; } bar.classList.remove('run'); bar.style.width = '0'; }

      dotEls.forEach(function (d) {
        d.addEventListener('click', function () {
          paint(parseInt(d.getAttribute('data-i'), 10));
          play();
        });
      });
      panel.addEventListener('mouseenter', stop);
      panel.addEventListener('mouseleave', play);
      panel.addEventListener('touchstart', stop, { passive: true });
      var lz1 = document.getElementById('lead-zoom');
      if (lz1) setTimeout(function () { lz1.style.transform = 'scale(1.04)'; }, 400);
      play();
    })();

    /* signal chips */
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
            '<h3><a class="uline" href="' + storyUrl(s) + '">' + esc(plainHead(s.headline)) + '</a></h3>' +
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
    initReveal();
  }

  /* ---------- page: story ---------- */
  function renderStory() {
    var stories = allStories();
    mountChrome(null, stories);
    var root = document.getElementById('page');
    var slug = window.__LUMEN_SLUG__ || new URLSearchParams(location.search).get('slug') || cleanSlug(location.pathname);
    var s = stories.filter(function (x) { return x.slug === slug; })[0];

    if (!s) {
      root.innerHTML = '<div class="container empty"><h2>Story not found</h2>' +
        '<p>This story may not be published yet, or the link is out of date.</p>' +
        '<a class="btn" href="index.html">Back to the homepage</a></div>';
      return;
    }

    document.title = plainHead(s.headline) + ' \u00B7 Lumen';
    function setMeta(sel, val) {
      var m = document.querySelector(sel);
      if (m && val) m.setAttribute('content', val);
    }
    setMeta('meta[name="description"]', s.metaDescription || s.lede);
    setMeta('meta[property="og:title"]', plainHead(s.headline));
    setMeta('meta[property="og:description"]', s.metaDescription || s.lede);
    if (s.heroImage && s.heroImage.indexOf('data:') !== 0) setMeta('meta[property="og:image"]', s.heroImage);

    var related = stories.filter(function (x) { return x.slug !== s.slug && x.category === s.category; }).slice(0, 2);
    var relatedTitle = 'More in ' + esc(s.category);
    if (!related.length) {
      related = stories.filter(function (x) { return x.slug !== s.slug; }).slice(0, 2);
      relatedTitle = 'More from Lumen';
    }

    var html = '<div class="progress-bar" id="progress"></div><div class="article-wrap">';
    html += '<p class="breadcrumb"><a href="index.html">Home</a> \u2192 <a href="category.html?cat=' + catSlug(s.category) + '">' + esc(s.category) + '</a></p>';
    html += '<span class="cat-label">' + esc(s.category) + (s.subCategory ? ' \u00B7 ' + esc(s.subCategory) : '') + '</span>';
    html += '<h1 class="article-headline">' + hlHead(s.headline) + '</h1>';
    html += '<p class="article-lede">' + esc(s.lede) + '</p>';
    html += '<div class="article-meta-row"><div class="meta">' +
      '<span class="src-tag">' + esc(s.sourceType) + '</span><span class="sep"></span>' +
      '<span class="byline">By ' + esc(realAuthor(s)) + '</span><span class="sep"></span>' +
      '<span>' + fmtDate(s.publishDate) + '</span><span class="sep"></span>' +
      '<span>' + esc(s.readTime || 3) + ' min read</span><span class="sep"></span>' +
      '<span class="impact"><span class="impact-dot"></span>Impact ' + esc(s.impact) + '/10</span></div></div>';

    var readers = Number(s.readersToday) || 0;
    if (readers) html += '<p class="meta readers-line" style="margin-bottom:24px">' + num(readers) + ' people read this today</p>';

    if (s.heroImage) {
      html += '<figure><div class="article-hero"><img src="' + esc(s.heroImage) + '" alt="' + esc(s.imageCaption || plainHead(s.headline)) + '"></div>' +
        '<figcaption class="caption">' + esc(s.imageCaption || '') + (s.imageCredit ? ' \u00B7 ' + esc(s.imageCredit) : '') + '</figcaption></figure>';
    }

    html += '<div class="article-body">';
    if (s.whyItMatters) html += '<div class="why-matters"><strong>Why it matters \u2014</strong> ' + esc(s.whyItMatters) + '</div>';
    html += s.bodyHtml ? sanitizeBody(s.bodyHtml) : '<p>' + esc(s.lede) + '</p>';
    if (s.pullQuote) {
      html += '<blockquote>\u201C' + esc(s.pullQuote) + '\u201D' +
        '<p class="quote-attr">\u2014 ' + esc(s.pullQuoteAttribution || '') + '</p></blockquote>';
    }
    html += '</div>';

    if (s.videoUrl && /youtube\.com|youtu\.be/.test(s.videoUrl)) {
      var vid = (s.videoUrl.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/) || [])[1];
      if (vid) html += '<div style="aspect-ratio:16/9;border-radius:10px;overflow:hidden;margin:32px 0"><iframe width="100%" height="100%" src="https://www.youtube.com/embed/' + vid + '" frameborder="0" allowfullscreen title="Video"></iframe></div>';
    }

    html += '<div class="ad-slot" data-slot="article-mid"></div>';

    html += '<div class="data-box"><h4>The data</h4><table>' +
      (s.trialPhase ? '<tr><td>Trial phase</td><td>' + esc(s.trialPhase) + '</td></tr>' : '') +
      (s.patientN ? '<tr><td>Patients (n)</td><td>' + num(s.patientN) + '</td></tr>' : '') +
      (s.effectSize ? '<tr><td>Effect size (absolute)</td><td>' + esc(s.effectSize) + '</td></tr>' : '') +
      (s.diseaseBurden ? '<tr><td>Disease burden</td><td>' + esc(s.diseaseBurden) + '</td></tr>' : '') +
      (s.nctId ? '<tr><td>Registration</td><td><a href="https://clinicaltrials.gov/study/' + esc(s.nctId) + '" rel="noopener" target="_blank">' + esc(s.nctId) + '</a></td></tr>' : '') +
      '</table></div>';

    html += '<p class="source-line">Source: ' + (s.journalUrl ? '<a class="uline" href="' + esc(s.journalUrl) + '" rel="noopener" target="_blank">' + esc(s.journal) + '</a>' : esc(s.journal || '')) +
      ' \u00B7 ' + esc(s.author || 'Lumen Editorial') + ' \u00B7 ' + fmtDate(s.publishDate) + '</p>';

    html += '<details class="verify-panel"><summary>How we verified this</summary><div class="verify-body"><dl>' +
      '<dt>Source</dt><dd>' + esc(s.sourceType) + (s.journal ? ' \u00B7 ' + esc(s.journal) : '') + '</dd>' +
      (s.trialPhase ? '<dt>Trial phase</dt><dd>' + esc(s.trialPhase) + (s.nctId ? ' \u00B7 <a href="https://clinicaltrials.gov/study/' + esc(s.nctId) + '" rel="noopener" target="_blank">ClinicalTrials.gov ' + esc(s.nctId) + '</a>' : '') + '</dd>' : '') +
      '<dt>Lumen\u2019s five-point filter</dt><dd>Every Lumen story must pass checks on source tier, trial phase, reported patient numbers, absolute effect size, and disease burden before publishing. <a class="uline" href="about.html">Read our standards \u2192</a></dd>' +
      (s.journalUrl ? '<dd style="margin-top:12px"><a class="uline" href="' + esc(s.journalUrl) + '" rel="noopener" target="_blank">View primary source \u2192</a></dd>' : '') +
      '</dl></div></details>';

    html += '<div class="share-bar" id="share-bar"><span class="share-label">Share</span></div>';

    html += '<div class="reactions">' + REACTIONS.map(function (r) {
      var c = (s.reactions && s.reactions[r.key]) || 0;
      return '<button class="reaction" data-react="' + r.key + '">' + icon(r.icon) + '<span>' + r.label + '</span>' + (c ? '<span class="count">' + num(c) + '</span>' : '') + '</button>';
    }).join('') + '</div>';
    html += '<p class="reaction-note" id="react-note">Sign in to react. Reader accounts are coming soon.</p>';

    html += '<div class="related"><h2>' + relatedTitle + '</h2><div class="compact-grid">' + related.map(compactCardHTML).join('') + '</div></div>';

    html += '<div style="margin-top:56px">' + newsletterBannerHTML('newsletter') + '</div>';
    html += '<p class="caption" style="margin-top:24px"><a class="uline" href="corrections.html">See correction history</a></p>';
    html += '</div>';

    root.innerHTML = html;

    var bar = document.getElementById('progress');
    window.addEventListener('scroll', function () {
      var h = document.documentElement;
      var pct = h.scrollTop / (h.scrollHeight - h.clientHeight) * 100;
      bar.style.width = pct + '%';
    }, { passive: true });

    /* share bar */
    (function () {
      var sb = document.getElementById('share-bar');
      if (!sb) return;
      var url = CONFIG.siteUrl + storyUrl(s);
      var title = plainHead(s.headline);
      var eu = encodeURIComponent(url), et = encodeURIComponent(title);
      var btns = [];
      if (navigator.share) {
        btns.push('<button class="share-btn primary" data-share="native">\u2191 Share</button>');
      }
      btns.push(
        '<a class="share-btn" href="https://twitter.com/intent/tweet?text=' + et + '&url=' + eu + '" target="_blank" rel="noopener">X</a>',
        '<a class="share-btn" href="https://api.whatsapp.com/send?text=' + et + '%20' + eu + '" target="_blank" rel="noopener">WhatsApp</a>',
        '<a class="share-btn" href="https://www.facebook.com/sharer/sharer.php?u=' + eu + '" target="_blank" rel="noopener">Facebook</a>',
        '<a class="share-btn" href="https://www.linkedin.com/sharing/share-offsite/?url=' + eu + '" target="_blank" rel="noopener">LinkedIn</a>',
        '<a class="share-btn" href="https://t.me/share/url?url=' + eu + '&text=' + et + '" target="_blank" rel="noopener">Telegram</a>',
        '<button class="share-btn" data-share="copy">Copy link</button>'
      );
      sb.insertAdjacentHTML('beforeend', btns.join(''));
      sb.addEventListener('click', function (e) {
        var n = e.target.closest('[data-share="native"]');
        var c = e.target.closest('[data-share="copy"]');
        if (n) { navigator.share({ title: title, url: url }).catch(function () {}); }
        if (c) {
          navigator.clipboard && navigator.clipboard.writeText(url);
          c.textContent = 'Copied';
          setTimeout(function () { c.textContent = 'Copy link'; }, 1800);
        }
      });
    })();

    root.addEventListener('click', function (e) {
      var r = e.target.closest('.reaction');
      if (r) {
        r.classList.remove('popped'); void r.offsetWidth; r.classList.add('popped');
        document.getElementById('react-note').textContent = 'Reactions need a reader account \u2014 accounts are coming soon. Counts shown are site-wide.';
      }
    });
    initReveal();
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
      '<header class="cat-header reveal"><span class="cat-label">Section</span><h1>' + esc(cat.name) + '</h1>' +
      '<p class="summary">' + esc(cat.summary) + '</p>' +
      '<p class="stat">' + esc(cat.stat) + ' \u00B7 ' + inCat.length + ' ' + (inCat.length === 1 ? 'story' : 'stories') + '</p></header>' +
      '<div class="filter-bar"><span class="label">Filter by impact</span>' +
      filters.map(function (f) {
        return '<a class="chip' + (impactMin === f.v ? ' active' : '') + '" href="category.html?cat=' + cat.slug + (f.v ? '&impact=' + f.v : '') + '">' + f.label + '</a>';
      }).join('') +
      '<button class="chip" id="follow-btn" style="margin-left:auto">Follow this topic</button></div>';

    var visible = inCat.filter(function (s) { return Number(s.impact) >= impactMin; });
    if (visible.length) {
      html += '<div class="cat-grid">' + visible.map(compactCardHTML).join('') + '</div>';
    } else {
      html += '<div class="empty" style="padding:64px 0"><h2 style="font-size:26px">' +
        (inCat.length ? 'No stories at this impact level yet.' : 'No ' + esc(cat.name) + ' stories yet.') + '</h2>' +
        '<p>' + (inCat.length ? 'Lower the impact filter to see all coverage in this section.' : 'New stories are published as soon as something clears Lumen\u2019s five-point filter.') + '</p></div>';
    }

    html += newsletterBannerHTML('newsletter') + '<div style="height:64px"></div></div>';
    root.innerHTML = html;

    document.getElementById('follow-btn').addEventListener('click', function () {
      try {
        var prefs = JSON.parse(localStorage.getItem('lumen_follows') || '[]');
        if (prefs.indexOf(cat.name) === -1) prefs.push(cat.name);
        localStorage.setItem('lumen_follows', JSON.stringify(prefs));
      } catch (e) {}
      this.textContent = 'Following';
      this.classList.add('active');
    });
    initReveal();
  }

  /* ---------- page: corrections ---------- */
  function renderCorrections() {
    var stories = allStories();
    mountChrome(null, stories);
    document.title = 'Correction log \u00B7 Lumen';
    var root = document.getElementById('page');
    var corrections = ((window.LUMEN_DATA && window.LUMEN_DATA.corrections) || []).slice();
    try {
      if (hasAdminSession()) {
        JSON.parse(localStorage.getItem('lumen_local_corrections') || '[]').forEach(function (c) { corrections.push(c); });
      }
    } catch (e) {}
    corrections.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

    var html = '<div class="container"><header class="cat-header reveal"><span class="cat-label">Trust</span>' +
      '<h1>Correction log</h1><p class="summary">A public, timestamped record of every correction made to a published Lumen story \u2014 updated within 24 hours of any change. Editorial standards only count if you can see them enforced.</p></header>';

    if (corrections.length) {
      html += corrections.map(function (c) {
        var s = stories.filter(function (x) { return x.slug === c.slug; })[0];
        return '<div class="correction-row"><span class="date">' + fmtDate(c.date) + '</span>' +
          '<h3 style="font-size:19px;margin:4px 0">' + (s ? '<a href="' + storyUrl(s) + '">' + esc(plainHead(s.headline)) + '</a>' : esc(plainHead(c.headline || c.slug))) + '</h3>' +
          '<p style="font-size:15px"><strong>What changed:</strong> ' + esc(c.what) + '</p>' +
          (c.why ? '<p style="font-size:15px;color:var(--text-muted)"><strong>Why:</strong> ' + esc(c.why) + '</p>' : '') + '</div>';
      }).join('');
    } else {
      html += '<div class="empty" style="padding:64px 0"><h2 style="font-size:26px">No corrections yet.</h2>' +
        '<p>When a published story is corrected, the full record appears here.</p></div>';
    }
    html += '<div style="height:80px"></div></div>';
    root.innerHTML = html;
    initReveal();
  }

  /* ---------- page: about & standards ---------- */
  function renderAbout() {
    var stories = allStories();
    mountChrome(null, stories);
    document.title = 'About & editorial standards \u00B7 Lumen';
    var root = document.getElementById('page');
    root.innerHTML = '<div class="prose">' +
      '<span class="kicker">About Lumen</span>' +
      '<h1>Breakthroughs brought to light.</h1>' +
      '<p>Lumen covers the world\u2019s most important medical and technological advances and translates them into clear, human stories. We exist because health news is broken in two directions at once: the hype machine oversells weak science, and the academic literature buries strong science in language nobody can read. Lumen sits in the gap \u2014 rigorous about evidence, ruthless about clarity.</p>' +
      '<p>We are independent, ad-light by design, and we publish nothing we can\u2019t source. Every story names its journal, its trial phase, its patient numbers, and its effect size in absolute terms. When we get something wrong, the fix goes in our <a class="uline" href="corrections.html">public correction log</a> within 24 hours.</p>' +
      '<h2>The five-point filter</h2>' +
      '<p>Before any story is published, it must pass all five of these checks. If it fails one, it doesn\u2019t run \u2014 no matter how shareable the headline would be.</p>' +
      '<div class="filter-list">' +
      '<div class="f-item"><strong>Source tier</strong><span>Peer-reviewed in a top-tier journal (NEJM, JAMA, The Lancet, Nature Medicine, Nature, Cell, Science) or a direct FDA, EMA, or WHO source.</span></div>' +
      '<div class="f-item"><strong>Trial phase</strong><span>Phase 2 minimum with a strong signal. Phase 3 or real-world data preferred. Phase 1 only when the cohort is large and the effect unambiguous.</span></div>' +
      '<div class="f-item"><strong>Patient numbers</strong><span>A specific n must be reported. Modelling and projections are supplementary, never the story.</span></div>' +
      '<div class="f-item"><strong>Effect size</strong><span>Clinically meaningful and reported in absolute terms \u2014 not relative risk reduction dressed up as a miracle.</span></div>' +
      '<div class="f-item"><strong>Disease burden</strong><span>The advance must matter to a meaningful population \u2014 or be mechanistically groundbreaking for a rare one.</span></div>' +
      '</div>' +
      '<h2>What we are not</h2>' +
      '<p>Lumen is journalism, not medical advice. Nothing we publish is a recommendation to start, stop, or change any treatment. Always consult a qualified clinician about your own health. We do not cover pre-prints as confirmed findings, we do not report relative risk without absolute context, and we do not use the word \u201Ccure\u201D unless a regulator would.</p>' +
      '<h2>Corrections & contact</h2>' +
      '<p>Spotted an error? Tell us and we\u2019ll fix it publicly: <strong>hello@readlumen.site</strong>. Every correction is logged, dated, and explained in the <a class="uline" href="corrections.html">correction log</a>.</p>' +
      '<p style="margin-top:32px"><a class="btn" href="index.html#newsletter">Get the newsletter \u2192</a></p>' +
      '</div>';
    initReveal();
  }

  /* ---------- page: privacy ---------- */
  function renderPrivacy() {
    var stories = allStories();
    mountChrome(null, stories);
    document.title = 'Privacy policy \u00B7 Lumen';
    var root = document.getElementById('page');
    root.innerHTML = '<div class="prose">' +
      '<span class="kicker">Legal</span>' +
      '<h1>Privacy policy</h1>' +
      '<p>Last updated: ' + fmtDate(new Date().toISOString()) + '</p>' +
      '<p>Lumen (readlumen.site) is a health and medical-technology news publication. This page explains what data we handle and why. The short version: we collect very little, we sell nothing, and we don\u2019t want your data any more than you want to give it.</p>' +
      '<h2>What we collect</h2>' +
      '<ul>' +
      '<li><strong>Newsletter signups.</strong> If you subscribe, your email address is processed by our email newsletter provider to deliver the newsletter. You can unsubscribe at any time using the link in every email, and your address is removed from active sends.</li>' +
      '<li><strong>Analytics.</strong> We use privacy-respecting, aggregate analytics (such as Vercel Web Analytics) to understand how many people read which stories. This does not use advertising cookies and does not build individual profiles.</li>' +
      '<li><strong>Local preferences.</strong> Features like \u201CFollow this topic\u201D store your preference in your own browser\u2019s local storage. That data never leaves your device and we cannot see it.</li>' +
      '</ul>' +
      '<h2>What we don\u2019t do</h2>' +
      '<ul>' +
      '<li>We do not sell or share personal data with third parties for marketing.</li>' +
      '<li>We do not run third-party advertising trackers. If we introduce advertising in the future, this policy and our consent prompts will be updated first.</li>' +
      '<li>We do not knowingly collect data from children under 16.</li>' +
      '</ul>' +
      '<h2>Your rights</h2>' +
      '<p>Depending on where you live (including under GDPR and similar laws), you may have the right to access, correct, or delete personal data we hold about you \u2014 in practice, that\u2019s your newsletter email address. Email <strong>hello@readlumen.site</strong> and we\u2019ll handle it.</p>' +
      '<h2>Medical disclaimer</h2>' +
      '<p>Lumen is journalism, not medical advice. Nothing on this site is a substitute for consultation with a qualified clinician. Never disregard professional medical advice because of something you read here.</p>' +
      '<h2>Contact</h2>' +
      '<p>Questions about this policy: <strong>hello@readlumen.site</strong>.</p>' +
      '</div>';
    initReveal();
  }

  /* ---------- boot ---------- */
  window.LUMEN = {
    CONFIG: CONFIG, CATEGORIES: CATEGORIES, REACTIONS: REACTIONS,
    allStories: allStories, esc: esc, fmtDate: fmtDate,
    renderHome: renderHome, renderStory: renderStory,
    renderCategory: renderCategory, renderCorrections: renderCorrections,
    renderAbout: renderAbout, renderPrivacy: renderPrivacy
  };
})();
