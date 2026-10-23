(function () {
  // ─── Config ──────────────────────────────────────────────────────────────────
  var HERO = {
    src:       '_images/profile.jpg',
    duration:  2500,           // ms total
    charRamp:  '@#%S+!*;:,. ', // dense (dark) → sparse (light)
    cellStart: 14,             // CSS px — coarse grid at t=0
    cellEnd:   4,              // CSS px — fine grid at t=1
    blurStart: 10,             // px blur on photo at t=0
    height:    140,            // CSS px height of widget
    fontScale: 0.85,           // char size relative to cell
  };
  // ─────────────────────────────────────────────────────────────────────────────

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initHero() {
    var wrapper = document.getElementById('ascii-hero');
    if (!wrapper) return;

    var img = new Image();

    img.onload = function () {
      var aspect = img.naturalWidth / img.naturalHeight;
      var cssH   = HERO.height;
      var cssW   = Math.round(cssH * aspect);
      var dpr    = window.devicePixelRatio || 1;

      // ── Canvas ──────────────────────────────────────────────────────────────
      var canvas        = document.createElement('canvas');
      canvas.width      = Math.round(cssW * dpr);
      canvas.height     = Math.round(cssH * dpr);
      canvas.style.width  = cssW + 'px';
      canvas.style.height = cssH + 'px';
      canvas.style.display = 'block';
      wrapper.appendChild(canvas);

      var ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      // ── Sample image into offscreen canvas (once) ────────────────────────
      var off   = document.createElement('canvas');
      off.width  = cssW;
      off.height = cssH;
      var offCtx = off.getContext('2d');
      offCtx.drawImage(img, 0, 0, cssW, cssH);
      var imgData = offCtx.getImageData(0, 0, cssW, cssH).data;

      // ── Reduced motion: skip straight to photo ────────────────────────────
      if (prefersReduced) {
        ctx.drawImage(img, 0, 0, cssW, cssH);
        return;
      }

      // ── Draw helpers ──────────────────────────────────────────────────────
      function drawPhoto(blur, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        if (blur > 0.05) ctx.filter = 'blur(' + blur.toFixed(2) + 'px)';
        ctx.drawImage(img, 0, 0, cssW, cssH);
        ctx.restore();
      }

      function drawASCII(cellPx, alpha) {
        if (alpha < 0.005) return;
        var ramp  = HERO.charRamp;
        var cols  = Math.ceil(cssW / cellPx);
        var rows  = Math.ceil(cssH / cellPx);
        var fSize = Math.max(3, Math.floor(cellPx * HERO.fontScale));

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font         = fSize + 'px "DM Mono","Courier New",monospace';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = '#333333';

        for (var r = 0; r < rows; r++) {
          for (var c = 0; c < cols; c++) {
            var px  = Math.min(Math.floor(c * cellPx + cellPx * 0.5), cssW - 1);
            var py  = Math.min(Math.floor(r * cellPx + cellPx * 0.5), cssH - 1);
            var idx = (py * cssW + px) * 4;
            var lum = (imgData[idx] * 0.299 + imgData[idx + 1] * 0.587 + imgData[idx + 2] * 0.114) / 255;
            var ci  = Math.round(lum * (ramp.length - 1));
            ctx.fillText(ramp[ci], c * cellPx + cellPx * 0.5, r * cellPx + cellPx * 0.5);
          }
        }
        ctx.restore();
      }

      // ── Animation loop ────────────────────────────────────────────────────
      var startTime = null;

      function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

      function frame(ts) {
        if (!startTime) startTime = ts;
        var t = Math.min((ts - startTime) / HERO.duration, 1);
        var e = easeOut(t);

        // Opaque white base so canvas never looks transparent
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cssW, cssH);

        if (e > 0.005) drawPhoto(HERO.blurStart * (1 - e), e);
        drawASCII(HERO.cellStart + (HERO.cellEnd - HERO.cellStart) * e, 1 - e);

        if (t < 1) requestAnimationFrame(frame);
      }

      requestAnimationFrame(frame);

      // ── Public replay ─────────────────────────────────────────────────────
      wrapper.replay = function () {
        startTime = null;
        requestAnimationFrame(frame);
      };
    };

    img.src = HERO.src;
  }

  // ── Replay on scroll-into-view (skip first intersection — that's page load) ──
  function setupObserver() {
    var wrapper = document.getElementById('ascii-hero');
    if (!wrapper || typeof IntersectionObserver === 'undefined') return;
    var played = false;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          if (played) wrapper.replay && wrapper.replay();
          played = true;
        }
      });
    }, { threshold: 0.5 });
    obs.observe(wrapper);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initHero(); setupObserver(); });
  } else {
    initHero();
    setupObserver();
  }
})();
