/* ============================================================
   NYAVE — site.js
   Restrained motion only: scroll reveals, number count-ups,
   mobile nav toggle, active-link sync, timeline fill.
   ============================================================ */
(function () {
  "use strict";
  window.__nyaveRan = true;

  /* ---- mobile nav ---------------------------------------- */
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
    });
  }

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- count-up for [data-count] ------------------------- */
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';
    function format(v) {
      if (decimals > 0) return v.toFixed(decimals);
      return Math.round(v).toLocaleString('en-US');
    }
    if (reduce || isNaN(target)) {
      el.textContent = prefix + format(target) + suffix;
      return;
    }
    var dur = 1100, start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var v = target * easeOutCubic(p);
      el.textContent = prefix + format(v) + suffix;
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = prefix + format(target) + suffix;
    }
    requestAnimationFrame(step);
  }

  /* ---- intersection reveals + triggered count-ups -------- */
  var revealEls = [].slice.call(document.querySelectorAll('.reveal'));
  var counted = new WeakSet();

  function fireCounters(scope) {
    [].slice.call(scope.querySelectorAll('[data-count]')).forEach(function (c) {
      if (!counted.has(c)) { counted.add(c); countUp(c); }
    });
  }
  function show(el) {
    if (el.classList.contains('in')) return;
    el.classList.add('in');
    fireCounters(el);
  }
  function inViewNow(el) {
    var r = el.getBoundingClientRect();
    return r.top < (window.innerHeight || 800) * 0.94 && r.bottom > 0;
  }

  // 1) reveal anything already in the initial viewport right away
  revealEls.forEach(function (el) { if (inViewNow(el)) show(el); });

  // 2) observe the rest
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        show(e.target); io.unobserve(e.target);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(function (el) { if (!el.classList.contains('in')) io.observe(el); });
  } else {
    revealEls.forEach(show);
  }

  // 3) standalone counters (not wrapped in .reveal)
  [].slice.call(document.querySelectorAll('[data-count]')).forEach(function (c) {
    if (c.closest('.reveal')) return;
    if (inViewNow(c) && !counted.has(c)) { counted.add(c); countUp(c); return; }
    if ('IntersectionObserver' in window) {
      var io2 = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting && !counted.has(c)) { counted.add(c); countUp(c); io2.unobserve(c); }
        });
      }, { threshold: 0.6 });
      io2.observe(c);
    } else if (!counted.has(c)) { counted.add(c); countUp(c); }
  });

  // 4) on scroll, reveal anything that has entered view (covers flaky IO)
  function scanScroll() {
    var any = false;
    revealEls.forEach(function (el) { if (!el.classList.contains('in') && inViewNow(el)) { show(el); } else if (!el.classList.contains('in')) any = true; });
    if (!any) window.removeEventListener('scroll', scanScroll);
  }
  window.addEventListener('scroll', scanScroll, { passive: true });

  // 5) safety net: never leave content invisible
  setTimeout(function () { revealEls.forEach(show); }, 1600);

  /* ---- timeline fill grows to the last active node ------- */
  var timeline = document.querySelector('.timeline');
  var setFill;
  if (timeline) {
    var fill = timeline.querySelector('.tl-fill');
    var items = [].slice.call(timeline.querySelectorAll('.tl-item'));
    // Re-scans the last active/done node on every call, so the fill stays
    // correct even after progress.json updates the stage classes at runtime.
    setFill = function () {
      if (!fill) return;
      var la = null;
      items.forEach(function (it) {
        if (it.classList.contains('is-active') || it.classList.contains('is-done')) la = it;
      });
      if (!la) { fill.style.height = '0px'; return; }
      var node = la.querySelector('.tl-node');
      var top = timeline.getBoundingClientRect().top;
      var ny = node.getBoundingClientRect().top - top + 10;
      fill.style.height = Math.max(0, ny) + 'px';
    };
    if (fill) {
      if (!reduce) fill.style.transition = 'height 900ms cubic-bezier(0.16,1,0.3,1)';
      setFill();
      window.addEventListener('resize', setFill);
      if (!reduce && 'IntersectionObserver' in window) {
        fill.style.height = '0px';
        var ioF = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) { if (e.isIntersecting) { setFill(); ioF.unobserve(timeline); } });
        }, { threshold: 0.15 });
        ioF.observe(timeline);
      }
    }
  }

  /* ---- progress tracker reads ONE curated public file ---- */
  // progress.json is the single source both tracker views read (quick + timeline).
  // The hardcoded HTML values are the fail-safe fallback if the fetch fails.
  function applyProgress(data) {
    if (!data || !Array.isArray(data.stages)) return;
    var stateClass = { done: 'is-done', ongoing: 'is-active', in_progress: 'is-active', upcoming: 'is-next', target: 'is-target' };
    data.stages.forEach(function (s) {
      var cls = stateClass[s.status] || 'is-next';
      var hasPct = s.percent !== null && s.percent !== undefined;
      var pctTxt = hasPct ? s.percent + '%' : null;
      // quick view (hero)
      var q = document.querySelector('.qstage[data-stage="' + s.id + '"]');
      if (q) {
        q.className = 'qstage ' + cls;
        var qp = q.querySelector('.qstage-pct');
        if (qp) {
          if (!hasPct) { qp.style.display = 'none'; }
          else { qp.style.display = ''; qp.textContent = pctTxt; qp.classList.toggle('muted', s.percent === 0); }
        }
        var qs = q.querySelector('.qstage-status');
        if (qs) {
          if (s.status === 'target') qs.innerHTML = 'Target · <b>' + (s.date || data.launch_target || '') + '</b><span class="ast">*</span>';
          else qs.textContent = s.public_status || '';
        }
        var qf = q.querySelector('.qbar-fill');
        if (qf) qf.style.width = (hasPct ? s.percent : 0) + '%';
      }
      // detailed timeline
      var t = document.querySelector('.tl-item[data-stage="' + s.id + '"]');
      if (t) {
        t.className = 'tl-item ' + cls;
        var ts = t.querySelector('.tl-status');
        if (ts) ts.textContent = (s.public_status || '') + (pctTxt !== null ? ' · ' + pctTxt : '');
        var tf = t.querySelector('.tl-bar-fill');
        if (tf) tf.style.width = (hasPct ? s.percent : 0) + '%';
        var td = t.querySelector('.tl-date');
        if (td && s.date) td.innerHTML = s.date + '<span class="ast">*</span>';
      }
    });
    if (data.as_of) {
      [].slice.call(document.querySelectorAll('.js-asof')).forEach(function (el) { el.textContent = data.as_of; });
    }
    if (typeof setFill === 'function') setFill();
  }

  if (window.fetch) {
    fetch('progress.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) applyProgress(d); })
      .catch(function () { /* fallback: the hardcoded HTML values stand */ });
  }
})();
