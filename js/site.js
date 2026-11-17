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

  function init() { setupSpy(); setupCopy(); setupRush(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
