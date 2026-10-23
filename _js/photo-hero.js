(function () {
  // ─── Config ──────────────────────────────────────────────────────────────────
  var CFG = {
    src:         '_images/profile.png',
    height:      160,   // CSS px display height
    step:        2,     // CSS px per pixel block
    spring:      0.08,
    damping:     0.76,
    delay:       80,    // ms — matches particles.js intro delay
    repelRadius: 35,    // px — cursor repel radius
    repelForce:  2.2,   // cursor repel strength
    burstMin:    3,
    burstMax:    12,
    jitter:      0.02,
  };

  // Expose for the particle control panel
  window.__photoCFG = CFG;
  // ─────────────────────────────────────────────────────────────────────────────

  var particles = [], count = 0, step;
  var img, dest, overlay, oc;
  var cssW, cssH, dpr, vw, vh;
  var loopRunning = false;
  var prevScrollY = 0;

  // Mouse position in CSS viewport px (shared with the cursor div)
  var mouseX = -9999, mouseY = -9999;
  document.addEventListener('mousemove', function (e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    maybeWake();
  });
  document.addEventListener('mouseleave', function () {
    mouseX = -9999; mouseY = -9999;
  });

  // Keep the crisp photo in sync while the physics loop is sleeping
  window.addEventListener('scroll', function () {
    if (!loopRunning && oc) drawCrisp();
  }, { passive: true });

  // ── Start the physics loop, snapping pixels to their current targets first ──
  function wakeLoop() {
    if (loopRunning || !count) return;
    var r = dest.getBoundingClientRect();
    for (var i = 0; i < count; i++) {
      var p = particles[i];
      p.tx = r.left + p.c * step;
      p.ty = r.top  + p.r * step;
      p.x  = p.tx;
      p.y  = p.ty;
      p.vx = 0;
      p.vy = 0;
    }
    loopRunning = true;
    prevScrollY = window.scrollY;
    requestAnimationFrame(frame);
  }

  // ── Wake when cursor enters the repel zone ───────────────────────────────────
  function maybeWake() {
    if (!dest || loopRunning) return;
    var r = dest.getBoundingClientRect();
    var m = CFG.repelRadius + 10;
    if (mouseX > r.left - m && mouseX < r.right  + m &&
        mouseY > r.top  - m && mouseY < r.bottom + m) {
      wakeLoop();
    }
  }

  // ── Click burst (matching text-particle click behaviour) ─────────────────────
  document.addEventListener('click', function (e) {
    if (!dest || !count) return;
    var r  = dest.getBoundingClientRect();
    var cx = e.clientX, cy = e.clientY;
    var burstR = 90;
    if (cx < r.left - burstR || cx > r.right  + burstR ||
        cy < r.top  - burstR || cy > r.bottom + burstR) return;
    wakeLoop();
    var burstR2 = burstR * burstR;
    for (var i = 0; i < count; i++) {
      var p  = particles[i];
      var dx = p.x - cx, dy = p.y - cy;
      var d2 = dx * dx + dy * dy;
      if (d2 < burstR2) {
        var t = 1 - Math.sqrt(d2) / burstR;
        var s = CFG.burstMin * t + Math.random() * (CFG.burstMax - CFG.burstMin) * t;
        var a = Math.random() * Math.PI * 2;
        p.vx += Math.cos(a) * s;
        p.vy += Math.sin(a) * s;
      }
    }
  });

  // ── Draw crisp photo on the overlay at the photo's current viewport position ─
  function drawCrisp() {
    var r = dest.getBoundingClientRect();
    oc.clearRect(0, 0, vw, vh);
    oc.drawImage(img, r.left, r.top, cssW, cssH);
  }

  // ── Main physics + render loop ───────────────────────────────────────────────
  function frame() {
    if (!loopRunning) return;

    // Scroll delta — keep pixels locked to the photo as the page scrolls
    var dScrollY = window.scrollY - prevScrollY;
    prevScrollY  = window.scrollY;

    var sp = CFG.spring;
    var dm = CFG.damping;
    var rr = CFG.repelRadius;
    var rf = CFG.repelForce;

    // Recompute targets from current viewport position of the placeholder
    var rect    = dest.getBoundingClientRect();
    var allDone = true;

    oc.clearRect(0, 0, vw, vh);

    for (var i = 0; i < count; i++) {
      var p = particles[i];

      // Stay in sync with scroll
      if (dScrollY !== 0) p.y -= dScrollY;

      // Update target to current viewport position
      p.tx = rect.left + p.c * step;
      p.ty = rect.top  + p.r * step;

      // Spring toward target
      p.vx += (p.tx - p.x) * sp;
      p.vy += (p.ty - p.y) * sp;

      // Cursor repel
      var dx = p.x - mouseX;
      var dy = p.y - mouseY;
      var d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 0.01) {
        var d = Math.sqrt(d2);
        var f = ((rr - d) / rr) * rf;
        p.vx += (dx / d) * f;
        p.vy += (dy / d) * f;
      }

      p.vx *= dm;
      p.vy *= dm;
      p.x  += p.vx;
      p.y  += p.vy;

      if (allDone && (
        Math.abs(p.tx - p.x) > 0.4 ||
        Math.abs(p.ty - p.y) > 0.4 ||
        Math.abs(p.vx) > 0.04 ||
        Math.abs(p.vy) > 0.04
      )) { allDone = false; }

      oc.fillStyle = p.color;
      oc.fillRect(p.x, p.y, step, step);
    }

    // Check whether cursor is still in the repel zone
    var m = rr + 10;
    var mouseNear = mouseX > rect.left - m && mouseX < rect.right  + m &&
                    mouseY > rect.top  - m && mouseY < rect.bottom + m;

    if (!allDone || mouseNear) {
      requestAnimationFrame(frame);
    } else {
      // Settled, cursor away — switch to crisp photo and sleep
      loopRunning = false;
      drawCrisp();
    }
  }

  // ── Scatter + start the intro animation ─────────────────────────────────────
  function play() {
    vw  = window.innerWidth;
    vh  = window.innerHeight;
    var rect = dest.getBoundingClientRect();
    prevScrollY = window.scrollY;

    for (var i = 0; i < count; i++) {
      var p  = particles[i];
      p.tx   = rect.left + p.c * step;
      p.ty   = rect.top  + p.r * step;
      p.x    = p.tx;
      p.y    = p.ty;
      p.vx   = 0;
      p.vy   = 0;
    }

    // Full-page overlay — persists for cursor interaction after intro
    if (overlay && overlay.parentNode) document.body.removeChild(overlay);
    overlay = document.createElement('canvas');
    overlay.width  = Math.round(vw * dpr);
    overlay.height = Math.round(vh * dpr);
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'left:0',
      'width:'  + vw + 'px',
      'height:' + vh + 'px',
      'pointer-events:none',
      'z-index:9997',
    ].join(';');
    document.body.appendChild(overlay);
    oc = overlay.getContext('2d');
    oc.scale(dpr, dpr);

    loopRunning = true;
    requestAnimationFrame(frame);
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    var wrapper = document.getElementById('photo-hero');
    if (!wrapper) return;

    img = new Image();
    img.onload = function () {
      var ar = img.naturalWidth / img.naturalHeight;
      cssH = CFG.height;
      cssW = Math.round(cssH * ar);
      dpr  = window.devicePixelRatio || 1;
      step = CFG.step;

      // Placeholder — stays hidden; overlay handles all rendering
      dest = document.createElement('canvas');
      dest.width  = Math.round(cssW * dpr);
      dest.height = Math.round(cssH * dpr);
      dest.style.width   = cssW + 'px';
      dest.style.height  = cssH + 'px';
      dest.style.display = 'block';
      dest.style.visibility = 'hidden';
      wrapper.appendChild(dest);

      // Reduced motion: draw directly on dest, skip overlay entirely
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        var dc = dest.getContext('2d');
        dc.drawImage(img, 0, 0, dest.width, dest.height);
        dest.style.visibility = 'visible';
        return;
      }

      // Sample image at block resolution
      var cols = Math.ceil(cssW / step);
      var rows = Math.ceil(cssH / step);
      var off  = document.createElement('canvas');
      off.width  = cols;
      off.height = rows;
      var oCtx = off.getContext('2d');
      oCtx.drawImage(img, 0, 0, cols, rows);
      var raw = oCtx.getImageData(0, 0, cols, rows).data;

      particles = [];
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var di = (r * cols + c) * 4;
          if (raw[di + 3] < 10) continue;
          particles.push({
            c: c, r: r,
            tx: 0, ty: 0,
            x: 0, y: 0,
            vx: 0, vy: 0,
            color: 'rgb(' + raw[di] + ',' + raw[di + 1] + ',' + raw[di + 2] + ')',
          });
        }
      }
      count = particles.length;

      setTimeout(play, CFG.delay);
    };

    img.src = CFG.src;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
