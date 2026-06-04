/* ============================================================
   main.js — Brenden Fogg personal site
   ============================================================ */

// ---- Mobile nav toggle ----
document.addEventListener('DOMContentLoaded', function () {
  const toggle = document.querySelector('.mobile-toggle');
  const toc = document.querySelector('.toc');

  if (toggle && toc) {
    toggle.addEventListener('click', function () {
      toc.classList.toggle('open-nav');
    });
  }

  // Close mobile nav when a nav item is clicked
  const navLinks = document.querySelectorAll('.nav, .links a');
  navLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      if (toc) toc.classList.remove('open-nav');
    });
  });

  // ---- Smooth scroll for .nav divs (non-anchor elements) ----
  const navItems = document.querySelectorAll('.nav[href]');
  navItems.forEach(function (item) {
    item.addEventListener('click', function () {
      const target = document.querySelector(item.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // ---- Active nav highlight on scroll ----
  const sections = document.querySelectorAll('.anchor[id]');
  const navDivs = document.querySelectorAll('.nav');

  function onScroll() {
    let current = '';
    sections.forEach(function (section) {
      const top = section.getBoundingClientRect().top;
      if (top <= 80) current = section.id;
    });
    navDivs.forEach(function (div) {
      div.style.color = '';
      if (div.getAttribute('href') === '#' + current) {
        div.style.color = '#98ACF8';
      }
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
});
