/* ============================================================
   main.js — Brenden Fogg personal site
   ============================================================ */


document.addEventListener('DOMContentLoaded', function () {
  const toggle = document.querySelector('.mobile-toggle');
  const toc    = document.querySelector('.toc');

  if (toggle && toc) {
    toggle.addEventListener('click', function () {
      toc.classList.toggle('open-nav');
    });
  }

  document.querySelectorAll('.nav, .links a').forEach(function (link) {
    link.addEventListener('click', function () {
      if (toc) toc.classList.remove('open-nav');
    });
  });

  document.querySelectorAll('.nav[href]').forEach(function (item) {
    item.addEventListener('click', function () {
      const target = document.querySelector(item.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // ── Scrollspy — highlights the nav item for the current section ──────────
  const sections = document.querySelectorAll('.anchor[id]');
  const navDivs  = document.querySelectorAll('.nav');

  function onScroll() {
    let current = '';
    sections.forEach(function (section) {
      if (section.getBoundingClientRect().top <= window.innerHeight * 0.4) {
        current = section.id;
      }
    });
    navDivs.forEach(function (div) {
      div.classList.toggle('active', div.getAttribute('href') === '#' + current);
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // set initial state on load
});
