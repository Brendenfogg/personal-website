(function () {
  'use strict';

  // ─── Config — every property is independent per zone ────────────────────
  var CFG = {
    name: {
      repelForce:  4.3,
      repelRadius: 42,
      burstMin:    14,
      burstMax:    28,
      spring:      0.02,
      damping:     0.63,
      jitter:      0.195,
    },
    nav: {
      repelForce:  1.8,
      repelRadius: 14,
      burstMin:    10,
      burstMax:    22,
      spring:      0.115,
      damping:     0.63,
      jitter:      0.04,
    },
    heading: {
      repelForce:  3,
      repelRadius: 20,
      burstMin:    8,
      burstMax:    15,
      spring:      0.105,
      damping:     0.62,
      jitter:      0.09,
    },
    body: {
      repelForce:  1.2,
      repelRadius: 25,
      burstMin:    4,
      burstMax:    11,
      spring:      0.125,
      damping:     0.5,
      jitter:      0.115,
    },
  };

  var HOVER_COLOR = '#6ab0d8';

  // ─── State ──────────────────────────────────────────────────────────────
  var canvas, ctx;
  var particles  = [];
  var mx = -9999, my = -9999;
  var mvx = 0, mvy = 0, lastMx = 0, lastMy = 0;
  var frozen     = false;
  var speed      = 1.0;   // global velocity multiplier
  var INTRO      = { duration: 1500, startTime: null, active: false };
  var raf;
  var prevScrollY = window.scrollY;
  var prevScrollX = window.scrollX;

  // ─── Boot ───────────────────────────────────────────────────────────────
  function boot() {
    canvas = document.createElement('canvas');
    canvas.id = 'particle-canvas';
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9998;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    setSize();
    build();
    buildPanel();
    bindEvents();
    raf = requestAnimationFrame(loop);
  }

  function setSize() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width  = window.innerWidth  * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ─── DOM → Particles ────────────────────────────────────────────────────
  var ZONE_ROOTS = [
    { selector: '.name',               zone: 'name'    },
    { selector: '.links',              zone: 'nav'     },
    { selector: '.right-pane .anchor', zone: 'body'    },
  ];

  function build() {
    particles = [];
    for (var z = 0; z < ZONE_ROOTS.length; z++) {
      var roots = Array.from(document.querySelectorAll(ZONE_ROOTS[z].selector));
      for (var r = 0; r < roots.length; r++) {
        collectRoot(roots[r], ZONE_ROOTS[z].zone);
        if (particles.length >= 1400) break;
      }
      if (particles.length >= 1400) break;
    }
    document.body.classList.add('particles-on');
  }

  function collectRoot(root, defaultZone) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        var cs = getComputedStyle(p);
        if (cs.display === 'none' || cs.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var node;
    while ((node = walker.nextNode())) {
      if (particles.length >= 1400) break;
      var el   = node.parentElement;
      var zone = defaultZone;
      if (defaultZone === 'body') {
        var anc = el;
        while (anc && anc !== root) {
          if (anc.classList && anc.classList.contains('section')) { zone = 'heading'; break; }
          anc = anc.parentElement;
        }
      }
      extractChars(node, zone);
    }
  }

  function extractChars(textNode, zone) {
    var el    = textNode.parentElement;
    var cs    = getComputedStyle(el);
    var text  = textNode.textContent;
    var cmap  = buildColorMap(text);
    var font  = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    var budget    = 1400 - particles.length;
    var nonSpace  = text.replace(/\s/g, '').length;
    var step      = Math.max(1, Math.ceil(nonSpace / Math.min(budget, nonSpace)));
    var taken     = 0;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (!ch.trim()) continue;
      if (step > 1 && taken % step !== 0) { taken++; continue; }
      taken++;
      var range = document.createRange();
      range.setStart(textNode, i);
      range.setEnd(textNode, i + 1);
      var r = range.getBoundingClientRect();
      if (r.width < 0.5 || r.height < 0.5) continue;
      particles.push(new Particle(
        ch,
        r.left  + window.scrollX,
        r.top   + window.scrollY + r.height * 0.78,
        cmap[i] !== undefined ? cmap[i] : cs.color,
        font, el, zone
      ));
    }
  }

  var COLOR_WORDS = { red: '#e84040', green: '#3dcc7e', blue: '#4488ff' };
  function buildColorMap(text) {
    var lower = text.toLowerCase(), map = {};
    Object.keys(COLOR_WORDS).forEach(function (word) {
      var idx = lower.indexOf(word);
      while (idx !== -1) {
        for (var j = 0; j < word.length; j++) map[idx + j] = COLOR_WORDS[word];
        idx = lower.indexOf(word, idx + 1);
      }
    });
    return map;
  }

  // ─── Particle ───────────────────────────────────────────────────────────
  function Particle(char, docX, docY, color, font, el, zone) {
    this.char    = char;
    this.docX    = docX;
    this.docY    = docY;
    this.color   = color;
    this.font    = font;
    this.el      = el;
    this.zone    = zone;
    // Name and nav live in the CSS-fixed sidebar — their targets never scroll
    this.isFixed = (zone === 'name' || zone === 'nav');
    this.x       = docX - window.scrollX;
    this.y       = docY - window.scrollY;
    this.vx      = 0;
    this.vy      = 0;
  }

  Particle.prototype.snapHome = function () {
    this.x  = this.isFixed ? this.docX : this.docX - window.scrollX;
    this.y  = this.isFixed ? this.docY : this.docY - window.scrollY;
    this.vx = 0;
    this.vy = 0;
  };

  Particle.prototype.update = function () {
    if (frozen) return;
    var zc = CFG[this.zone];
    var tx = this.isFixed ? this.docX : this.docX - window.scrollX;
    var ty = this.isFixed ? this.docY : this.docY - window.scrollY;

    // Spring — ramps 0→full during intro via smoothstep
    var springK = zc.spring;
    var introT  = 0;
    if (INTRO.active) {
      introT  = Math.min((Date.now() - INTRO.startTime) / INTRO.duration, 1);
      if (introT >= 1) { INTRO.active = false; updateIntroUI(); }
      var ease = introT * introT * (3 - 2 * introT);
      springK  = zc.spring * ease;
      // Chaos noise fades out as spring comes in
      var chaos = (1 - ease) * 1.8;
      this.vx += (Math.random() - 0.5) * chaos;
      this.vy += (Math.random() - 0.5) * chaos;
    }

    this.vx += (tx - this.x) * springK;
    this.vy += (ty - this.y) * springK;

    if (zc.jitter > 0) {
      this.vx += (Math.random() - 0.5) * zc.jitter;
      this.vy += (Math.random() - 0.5) * zc.jitter;
    }

    var dx = this.x - mx, dy = this.y - my;
    var d2 = dx * dx + dy * dy;
    var r  = zc.repelRadius;
    if (r > 0 && d2 < r * r && d2 > 0.01) {
      var d         = Math.sqrt(d2);
      var mouseSpd  = Math.sqrt(mvx * mvx + mvy * mvy);
      var boost     = 1 + Math.min(mouseSpd * 0.04, 1.5);
      var f         = ((r - d) / r) * zc.repelForce * boost;
      this.vx      += (dx / d) * f;
      this.vy      += (dy / d) * f;
    }

    this.vx *= zc.damping;
    this.vy *= zc.damping;
    this.x  += this.vx * speed;   // global speed — no longer shadowed
    this.y  += this.vy * speed;
  };

  Particle.prototype.burst = function (strength) {
    if (frozen) return;
    var zc = CFG[this.zone];
    var s  = strength !== undefined ? strength
      : zc.burstMin + Math.random() * (zc.burstMax - zc.burstMin);
    var a  = Math.random() * Math.PI * 2;
    this.vx += Math.cos(a) * s;
    this.vy += Math.sin(a) * s;
  };

  Particle.prototype.draw = function () {
    if (this.y < -50 || this.y > window.innerHeight + 50) return;
    ctx.font      = this.font;
    var hovered = this.el.closest('a:hover, .nav:hover, .about:hover');
    var active  = this.el.closest('.nav.active');
    ctx.fillStyle = (hovered || active) ? HOVER_COLOR : this.color;
    ctx.fillText(this.char, this.x, this.y);
  };

  // ─── Render loop ────────────────────────────────────────────────────────
  function loop() {
    var dScrollY = window.scrollY - prevScrollY;
    var dScrollX = window.scrollX - prevScrollX;
    prevScrollY  = window.scrollY;
    prevScrollX  = window.scrollX;

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      // Teleport scrollable particles by the scroll delta so they stay
      // locked to their text with zero lag — spring then handles everything else
      if (!p.isFixed && (dScrollY !== 0 || dScrollX !== 0)) {
        p.x -= dScrollX;
        p.y -= dScrollY;
      }
      p.update();
      p.draw();
    }
    raf = requestAnimationFrame(loop);
  }

  // ─── Freeze helpers ─────────────────────────────────────────────────────
  function freeze() {
    for (var i = 0; i < particles.length; i++) particles[i].snapHome();
    frozen = true;
    updateFreezeUI();
  }

  function unfreeze() {
    frozen = false;
    updateFreezeUI();
  }

  function updateFreezeUI() {
    var btn = document.getElementById('freeze-btn');
    var badge = document.getElementById('freeze-badge');
    if (btn)   btn.textContent   = frozen ? '▶  Unfreeze  (dbl-click)' : '❄  Freeze  (dbl-click)';
    if (badge) badge.style.display = frozen ? 'inline' : 'none';
  }

  // ─── Intro animation ────────────────────────────────────────────────────
  function playIntro() {
    frozen = false;
    var W = window.innerWidth, H = window.innerHeight;
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      // Start fully scattered across the viewport with random velocity
      p.x  = Math.random() * W;
      p.y  = Math.random() * H;
      p.vx = (Math.random() - 0.5) * 14;
      p.vy = (Math.random() - 0.5) * 14;
    }
    INTRO.startTime = Date.now();
    INTRO.active    = true;
    updateIntroUI();
  }

  function stopIntro() {
    INTRO.active = false;
    for (var i = 0; i < particles.length; i++) particles[i].snapHome();
    updateIntroUI();
  }

  function updateIntroUI() {
    var playBtn = document.getElementById('intro-play-btn');
    var stopBtn = document.getElementById('intro-stop-btn');
    if (!playBtn) return;
    if (INTRO.active) {
      playBtn.style.opacity = '0.45';
      stopBtn.style.opacity = '1';
    } else {
      playBtn.style.opacity = '1';
      stopBtn.style.opacity = '0.45';
    }
  }

  // ─── Control panel ──────────────────────────────────────────────────────
  var ZONE_META = [
    { key: 'name',    label: 'Name',      color: '#f0e8ff' },
    { key: 'nav',     label: 'Nav links', color: '#e8f0ff' },
    { key: 'heading', label: 'Headings',  color: '#e8fff0' },
    { key: 'body',    label: 'Body text', color: '#fff8e8' },
  ];

  var ZONE_SLIDERS = [
    { label: 'Repel force',    prop: 'repelForce',  min: 0,    max: 12,   step: 0.1   },
    { label: 'Repel radius',   prop: 'repelRadius', min: 0,    max: 250,  step: 1     },
    { label: 'Burst strength', prop: 'burstMax',    min: 0,    max: 60,   step: 1     },
    { label: 'Spring',         prop: 'spring',      min: 0.01, max: 0.30, step: 0.005 },
    { label: 'Damping',        prop: 'damping',     min: 0.5,  max: 0.99, step: 0.01  },
    { label: 'Jitter',         prop: 'jitter',      min: 0,    max: 0.5,  step: 0.005 },
  ];

  function buildPanel() {
    var panel = document.createElement('div');
    panel.id = 'particle-panel';
    panel.style.cssText = [
      'position:fixed', 'bottom:18px', 'right:18px',
      'background:rgba(255,255,255,0.97)', 'backdrop-filter:blur(10px)',
      'border:1px solid #e0e0e0', 'z-index:9999',
      'font:12px/1.5 monospace', 'color:#333',
      'width:285px', 'box-shadow:0 4px 24px rgba(0,0,0,0.13)',
      'user-select:none',
    ].join(';');

    // ── Header ──
    var header = el('div', 'display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #eee;cursor:pointer;');
    var titleWrap = el('span', 'display:flex;align-items:center;gap:6px;');
    var titleText = el('span', 'font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;color:#555;', 'Particle Controls');
    var freezeBadge = el('span', 'font-size:9px;background:#e84040;color:#fff;padding:1px 5px;letter-spacing:0.5px;display:none;', 'FROZEN');
    freezeBadge.id = 'freeze-badge';
    titleWrap.appendChild(titleText);
    titleWrap.appendChild(freezeBadge);
    var chevron = el('span', 'color:#aaa;font-size:13px;', '▾');
    header.appendChild(titleWrap);
    header.appendChild(chevron);
    panel.appendChild(header);

    // ── Scrollable body ──
    var body = el('div', 'max-height:68vh;overflow-y:auto;');

    // ── Speed slider (global, pinned at top) ──
    var speedSection = el('div', 'padding:10px 14px 10px;border-bottom:2px solid #e8e8e8;background:#f8f8f8;');
    var speedLabel   = el('div', 'font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#444;font-weight:bold;margin-bottom:8px;', '⚡  Speed');
    speedSection.appendChild(speedLabel);
    makeGlobalSlider(speedSection, 'Move speed', 0.1, 4.0, 0.05, speed, function (v) { speed = v; });
    body.appendChild(speedSection);

    // ── Intro animation section ──
    var introSection = el('div', 'padding:10px 14px 12px;border-bottom:2px solid #e8e8e8;background:#f8f8f8;');
    var introLabel   = el('div', 'font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#444;font-weight:bold;margin-bottom:8px;', '🎬  Intro Animation');
    introSection.appendChild(introLabel);
    makeGlobalSlider(introSection, 'Duration', 0.3, 5.0, 0.1, INTRO.duration / 1000, function (v) {
      INTRO.duration = Math.round(v * 1000);
    });
    var btnRow  = el('div', 'display:flex;gap:8px;margin-top:8px;');
    var playBtn = el('button',
      'flex:1;padding:6px 0;border:1px solid #bbb;background:#fff;cursor:pointer;font:11px monospace;color:#444;',
      '▶  Play'
    );
    playBtn.id = 'intro-play-btn';
    playBtn.addEventListener('click', function () { playIntro(); });
    var stopBtn = el('button',
      'flex:1;padding:6px 0;border:1px solid #bbb;background:#fff;cursor:pointer;font:11px monospace;color:#444;opacity:0.45;',
      '⏹  Skip to end'
    );
    stopBtn.id = 'intro-stop-btn';
    stopBtn.addEventListener('click', function () { stopIntro(); });
    btnRow.appendChild(playBtn);
    btnRow.appendChild(stopBtn);
    introSection.appendChild(btnRow);
    body.appendChild(introSection);

    // ── Zone sections ──
    ZONE_META.forEach(function (zm) {
      var section = el('div', 'padding:10px 14px 8px;border-bottom:1px solid #f2f2f2;');
      var sLabel  = el('div',
        'font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#666;' +
        'background:' + zm.color + ';padding:2px 8px;display:inline-block;margin-bottom:9px;',
        zm.label
      );
      section.appendChild(sLabel);
      ZONE_SLIDERS.forEach(function (s) {
        makeSlider(section, s.label, zm.key, s.prop, s.min, s.max, s.step);
      });
      body.appendChild(section);
    });

    // ── Freeze button ──
    var fSection = el('div', 'padding:10px 14px;border-bottom:1px solid #f2f2f2;');
    var freezeBtn = el('button',
      'width:100%;padding:6px 0;border:1px solid #ccc;background:#fafafa;cursor:pointer;font:11px monospace;color:#555;letter-spacing:0.5px;',
      '❄  Freeze  (dbl-click)'
    );
    freezeBtn.id = 'freeze-btn';
    freezeBtn.addEventListener('click', function () { frozen ? unfreeze() : freeze(); });
    fSection.appendChild(freezeBtn);
    body.appendChild(fSection);

    // ── Copy button ──
    var footer = el('div', 'padding:10px 14px;');
    var copyBtn = el('button',
      'width:100%;padding:6px 0;border:1px solid #ccc;background:#fafafa;cursor:pointer;font:11px monospace;color:#555;letter-spacing:0.5px;',
      'Copy current values'
    );
    copyBtn.addEventListener('click', function () {
      var lines = ['// speed: ' + speed + '  |  introDuration: ' + (INTRO.duration/1000) + 's'];
      ZONE_META.forEach(function (zm) {
        var zc = CFG[zm.key];
        lines.push(zm.key + ': { repelForce:' + zc.repelForce + ', repelRadius:' + zc.repelRadius + ', burstMax:' + zc.burstMax + ', spring:' + zc.spring + ', damping:' + zc.damping + ', jitter:' + zc.jitter + ' }');
      });
      navigator.clipboard.writeText(lines.join('\n')).then(function () {
        copyBtn.textContent = '✓  Copied!';
        setTimeout(function () { copyBtn.textContent = 'Copy current values'; }, 1800);
      });
    });
    footer.appendChild(copyBtn);
    body.appendChild(footer);

    panel.appendChild(body);
    document.body.appendChild(panel);

    // Collapse / expand
    var open = true;
    header.addEventListener('click', function () {
      open = !open;
      body.style.display = open ? '' : 'none';
      chevron.textContent = open ? '▾' : '▸';
    });
  }

  function makeGlobalSlider(parent, label, min, max, step, initVal, onChange) {
    var row     = el('div', 'display:flex;align-items:center;gap:6px;');
    var lbl     = el('span', 'width:90px;flex-shrink:0;color:#888;font-size:11px;', label);
    var input   = document.createElement('input');
    input.type  = 'range';
    input.min   = min;
    input.max   = max;
    input.step  = step;
    input.value = initVal;
    input.style.cssText = 'flex:1;cursor:pointer;accent-color:#333;';
    var valSpan = el('span', 'width:36px;text-align:right;color:#444;font-size:11px;', String(initVal));
    input.addEventListener('input', function () {
      onChange(parseFloat(input.value));
      valSpan.textContent = input.value;
    });
    row.appendChild(lbl);
    row.appendChild(input);
    row.appendChild(valSpan);
    parent.appendChild(row);
  }

  function makeSlider(parent, label, cfgKey, prop, min, max, step) {
    var row   = el('div', 'display:flex;align-items:center;gap:6px;margin-bottom:6px;');
    var lbl   = el('span', 'width:90px;flex-shrink:0;color:#888;font-size:11px;', label);
    var input = document.createElement('input');
    input.type  = 'range';
    input.min   = min;
    input.max   = max;
    input.step  = step;
    input.value = CFG[cfgKey][prop];
    input.style.cssText = 'flex:1;cursor:pointer;accent-color:#555;';
    var valSpan = el('span', 'width:36px;text-align:right;color:#444;font-size:11px;', String(CFG[cfgKey][prop]));
    input.addEventListener('input', function () {
      CFG[cfgKey][prop] = parseFloat(input.value);
      valSpan.textContent = input.value;
    });
    row.appendChild(lbl);
    row.appendChild(input);
    row.appendChild(valSpan);
    parent.appendChild(row);
  }

  function el(tag, style, text) {
    var node = document.createElement(tag);
    if (style) node.style.cssText = style;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ─── Events ─────────────────────────────────────────────────────────────
  var lastClickTime = 0;

  function bindEvents() {
    document.addEventListener('mousemove', function (e) {
      mvx = e.clientX - lastMx;
      mvy = e.clientY - lastMy;
      lastMx = mx = e.clientX;
      lastMy = my = e.clientY;
    });

    document.addEventListener('mouseleave', function () {
      mx = my = -9999;
      mvx = mvy = 0;
    });

    // Single click → burst; double-click → freeze / unfreeze
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('#particle-panel')) return;

      var now = Date.now();
      var gap = now - lastClickTime;
      lastClickTime = now;

      // If this click is the second of a double-click, handle freeze and skip burst
      if (gap < 300) {
        lastClickTime = 0; // reset so triple-click doesn't re-trigger
        frozen ? unfreeze() : freeze();
        return;
      }

      // Single-click burst (delayed slightly so double-click can cancel it)
      var snapE = { clientX: e.clientX, clientY: e.clientY, target: e.target };
      setTimeout(function () {
        if (Date.now() - lastClickTime < 300 && lastClickTime !== 0) return; // was a double-click
        if (frozen) return;
        handleBurst(snapE);
      }, 260);
    });

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        cancelAnimationFrame(raf);
        setSize();
        document.body.classList.remove('particles-on');
        particles = [];
        document.fonts.ready.then(function () { build(); raf = requestAnimationFrame(loop); });
      }, 180);
    });
  }

  function handleBurst(e) {
    var target  = e.target;
    var matched = [];
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (p.el === target || target.contains(p.el) || p.el.contains(target)) matched.push(p);
    }

    if (matched.length > 0) {
      var cx = 0, cy = 0;
      for (var i = 0; i < matched.length; i++) { cx += matched[i].x; cy += matched[i].y; }
      cx /= matched.length; cy /= matched.length;
      for (var i = 0; i < matched.length; i++) {
        var p    = matched[i];
        var dx   = p.x - cx, dy = p.y - cy;
        var extra = Math.min(Math.sqrt(dx * dx + dy * dy) * 0.25, 8);
        p.burst(CFG[p.zone].burstMin + extra + Math.random() * (CFG[p.zone].burstMax - CFG[p.zone].burstMin));
      }
    } else {
      var r2 = 130 * 130;
      for (var i = 0; i < particles.length; i++) {
        var p  = particles[i];
        var d2 = (p.x - e.clientX) * (p.x - e.clientX) + (p.y - e.clientY) * (p.y - e.clientY);
        if (d2 < r2) {
          var t = 1 - Math.sqrt(d2) / 130;
          p.burst(CFG[p.zone].burstMin * t + Math.random() * CFG[p.zone].burstMax * t);
        }
      }
    }
  }

  // ─── Start ──────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { document.fonts.ready.then(boot); });
  } else {
    document.fonts.ready.then(boot);
  }

})();
