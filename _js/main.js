/* ============================================================
   main.js — Brenden Fogg personal site
   ============================================================ */


document.addEventListener('DOMContentLoaded', function () {
  const toggle = document.querySelector('.mobile-toggle');
  const toc    = document.querySelector('.toc');

  function closeMenu() {
    if (toc) toc.classList.remove('open-nav');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  if (toggle && toc) {
    toggle.addEventListener('click', function () {
      const open = toc.classList.toggle('open-nav');
      toggle.setAttribute('aria-expanded', open);
    });

    // Escape or a tap outside the menu closes it
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toc.classList.contains('open-nav')) {
        closeMenu();
        toggle.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (toc.classList.contains('open-nav') && !toc.contains(e.target)) closeMenu();
    });
  }

  // External links open in a new tab so visitors keep their place
  document.querySelectorAll('a[href^="http"]').forEach(function (link) {
    link.target = '_blank';
    link.rel = 'noopener';
  });

  // ── Scrollspy — highlights the nav item for the current section ──────────
  const sections = document.querySelectorAll('.anchor[id]');
  const navLinks = document.querySelectorAll('.nav');
  let pinned = '';  // section the visitor just jumped to; wins until they scroll themselves

  function setActive(id) {
    navLinks.forEach(function (link) {
      const on = link.getAttribute('href') === '#' + id;
      link.classList.toggle('active', on);
      if (on) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }

  function onScroll() {
    if (pinned) return setActive(pinned);
    let current = '';
    sections.forEach(function (section) {
      if (section.getBoundingClientRect().top <= window.innerHeight * 0.4) {
        current = section.id;
      }
    });
    // Short last sections never reach the trigger line; at the bottom, the last one is current
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (atBottom && sections.length) current = sections[sections.length - 1].id;
    setActive(current);
  }

  document.querySelectorAll('.links a').forEach(function (link) {
    link.addEventListener('click', function () {
      closeMenu();
      const href = link.getAttribute('href');
      if (href && href.charAt(0) === '#') {
        pinned = href.slice(1);
        setActive(pinned);
      }
    });
  });

  ['wheel', 'touchstart', 'keydown'].forEach(function (type) {
    window.addEventListener(type, function () { pinned = ''; }, { passive: true });
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // set initial state on load
});
