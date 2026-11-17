/* Brenden Fogg — site.js. No dependencies. Everything here is an enhancement: the page reads fine without it. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- current section in the bar ---------- */
  function setupSpy() {
    if (!('IntersectionObserver' in window)) return;
    var links = {};
    $$('.bar__nav a[href^="#"]').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
    var clear = function () { Object.keys(links).forEach(function (k) { links[k].removeAttribute('aria-current'); }); };
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        clear();
        var a = links[en.target.id];
        if (a) a.setAttribute('aria-current', 'location');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    // observe every section, so the highlight clears in sections that have no link (hero, approach, contact)
    $$('main section[id]').forEach(function (s) { io.observe(s); });
  }

  /* ---------- copy the email address ---------- */
  function setupCopy() {
    var btn = $('#copy-email');
    if (!btn) return;
    btn.hidden = false;
    var label = btn.textContent;
    btn.addEventListener('click', function () {
      var email = btn.dataset.email;
      var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = label; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(email).then(done, function () { window.location.href = 'mailto:' + email; });
      else window.location.href = 'mailto:' + email;
    });
  }

  /* ---------- Rush: the hidden game, loaded only when someone finds it ---------- */
  var rushLoading = false;
  function openRush() {
    if (window.Rush) { window.Rush.open(); return; }
    if (rushLoading) return;
    rushLoading = true;
    var s = document.createElement('script');
    s.src = 'js/rush.js';
    s.onload = function () { rushLoading = false; window.Rush.open(); };
    s.onerror = function () { rushLoading = false; };
    document.head.appendChild(s);
  }
  window.rush = openRush;

  function setupRush() {
    $$('[data-rush]').forEach(function (b) { b.hidden = false; b.addEventListener('click', openRush); });
    if (window.location.hash === '#rush') openRush();
    var typed = '';
    window.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey || !e.key || e.key.length !== 1) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      typed = (typed + e.key.toLowerCase()).slice(-4);
      if (typed === 'rush') { typed = ''; openRush(); }
    });
    try {
      console.log('%cBrenden Fogg%c\nYou read consoles. I read processes. Type "rush" on the page, or call rush(), for the hidden game.', 'font:600 22px/1.2 system-ui,sans-serif', 'font:14px/1.5 system-ui,sans-serif');
    } catch (err) {}
  }

  /* ---------- project videos play while on screen ---------- */
  // Without JS, or with reduced motion, the video keeps its poster and native controls.
  function setupLiveVideos() {
    var vids = $$('video[data-live]');
    var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var saveData = navigator.connection && navigator.connection.saveData;
    if (!vids.length || still || saveData || !('IntersectionObserver' in window)) return;
    vids.forEach(function (v) { v.removeAttribute('controls'); v.preload = 'metadata'; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var v = en.target;
        if (en.isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () { v.setAttribute('controls', ''); }); }
        else v.pause();
      });
    }, { threshold: 0.4 });
    vids.forEach(function (v) { io.observe(v); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) vids.forEach(function (v) { v.pause(); }); });
  }

  /* ---------- skills light up the work behind them ---------- */
  function setupSkillLinks() {
    var marked = [];
    var clear = function () {
      marked.forEach(function (el) { el.classList.remove('is-match'); });
      marked = [];
      $$('.skill.is-active').forEach(function (s) { s.classList.remove('is-active'); });
    };
    var mark = function (src) {
      clear();
      if (src.classList.contains('skill')) src.classList.add('is-active');
      (src.dataset.targets || '').split(' ').forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { el.classList.add('is-match'); marked.push(el); }
      });
    };
    $$('.skill[data-targets], .chip[data-targets]').forEach(function (src) {
      src.addEventListener('mouseenter', function () { mark(src); });
      src.addEventListener('mouseleave', clear);
      src.addEventListener('focusin', function () { mark(src); });
      src.addEventListener('focusout', clear);
    });
  }

  /* ---------- experience timeline fills as you read ---------- */
  function setupTimeline() {
    var list = $('.xp__rows');
    var fill = $('.xp__fill');
    if (!list || !fill) return;
    var rows = $$('.xp__row', list);
    var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) { rows.forEach(function (r) { r.classList.add('is-reached'); }); return; }
    var ticking = false;
    var update = function () {
      ticking = false;
      var mid = window.innerHeight * 0.55;
      var r = list.getBoundingClientRect();
      var p = Math.max(0, Math.min(1, (mid - r.top) / r.height));
      fill.style.setProperty('--fill', p.toFixed(3));
      rows.forEach(function (row) { row.classList.toggle('is-reached', row.getBoundingClientRect().top + 24 < mid); });
    };
    fill.style.setProperty('--fill', '0');
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ---------- Poker: the word "poker" opens a table, loaded on demand ---------- */
  var pokerLoading = false;
  function loadScript(src, done) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = done;
    s.onerror = function () { pokerLoading = false; };
    document.head.appendChild(s);
  }
  function openPoker() {
    if (window.Poker) { window.Poker.open(); return; }
    if (pokerLoading) return;
    pokerLoading = true;
    loadScript('js/poker-engine.js', function () {
      loadScript('js/poker.js', function () { pokerLoading = false; if (window.Poker) window.Poker.open(); });
    });
  }
  window.poker = openPoker;
  function setupPoker() {
    $$('.poker-word[data-poker]').forEach(function (span) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'poker-link';
      b.textContent = span.textContent;
      b.setAttribute('aria-label', 'poker (opens a poker game)');
      b.addEventListener('click', openPoker);
      span.replaceWith(b);
    });
    if (window.location.hash === '#poker') openPoker();
  }

  function init() { setupSpy(); setupCopy(); setupRush(); setupLiveVideos(); setupSkillLinks(); setupTimeline(); setupPoker(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
