/* Block M: a spinning 3D Michigan Block M beside the name in the hero.
   The model is built in Blender (tools/block-m/build_block_m.py) and exported as assets/3d/block-m.glb.
   This file is a tiny glTF reader and WebGL renderer, so the page needs no 3D library.
   It turns slowly about its vertical axis; dragging or flicking spins it as fast as the flick,
   then it eases back to the slow turn. Arrow keys flick it too. With reduced motion it rests still. */
(function () {
  'use strict';
  var host = document.querySelector('[data-block-m]');
  if (!host) return;
  // desktop only: on phones and tablets the M is hidden, so nothing is downloaded or drawn
  var DESKTOP = window.matchMedia('(min-width: 60.0625rem)');
  if (!DESKTOP.matches) {
    var later = function () { if (DESKTOP.matches) { DESKTOP.removeEventListener('change', later); boot(); } };
    DESKTOP.addEventListener && DESKTOP.addEventListener('change', later);
    return;
  }
  boot();
  function boot() {
  var canvas = document.createElement('canvas');
  var gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true });
  if (!gl) return; // the PNG logo already in the box stays as the fallback

  var STILL = window.matchMedia('(prefers-reduced-motion: reduce)');
  var BASE = 0.275;         // radians per second when left alone (one turn about every 23 seconds)
  var MAX = 45;             // fastest spin a flick can give
  var src = host.getAttribute('data-src');

  /* ---------- glTF binary reader (positions, normals, indices, base colour) ---------- */
  function parseGlb(buf) {
    var dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
    var jsonLen = dv.getUint32(12, true);
    var json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
    var binStart = 20 + jsonLen + 8;
    function read(i) {
      var acc = json.accessors[i];
      var view = json.bufferViews[acc.bufferView];
      var off = binStart + (view.byteOffset || 0) + (acc.byteOffset || 0);
      var comps = { SCALAR: 1, VEC3: 3 }[acc.type];
      var n = acc.count * comps;
      if (acc.componentType === 5126) return new Float32Array(buf.slice(off, off + n * 4));
      if (acc.componentType === 5123) return new Uint16Array(buf.slice(off, off + n * 2));
      if (acc.componentType === 5125) return new Uint32Array(buf.slice(off, off + n * 4));
      throw new Error('unsupported accessor');
    }
    var parts = [];
    json.meshes.forEach(function (mesh) {
      mesh.primitives.forEach(function (p) {
        var mat = json.materials[p.material] || {};
        var c = (mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorFactor) || [0.5, 0.5, 0.5, 1];
        parts.push({ pos: read(p.attributes.POSITION), nor: read(p.attributes.NORMAL), idx: read(p.indices), color: c.slice(0, 3) });
      });
    });
    return parts;
  }

  /* ---------- shaders: soft key light, fill, rim and a little specular ---------- */
  var VS = [
    'attribute vec3 aPos; attribute vec3 aNor;',
    'uniform mat4 uModel; uniform mat4 uProj;',
    'varying vec3 vNor; varying vec3 vPos;',
    'void main(){ vec4 w = uModel * vec4(aPos,1.0); vPos = w.xyz; vNor = mat3(uModel) * aNor; gl_Position = uProj * w; }'
  ].join('\n');
  var FS = [
    'precision mediump float;',
    'uniform vec3 uColor; varying vec3 vNor; varying vec3 vPos;',
    'void main(){',
    '  vec3 n = normalize(vNor); if (!gl_FrontFacing) n = -n;',
    '  vec3 v = normalize(vec3(0.0,0.0,4.6) - vPos);',
    '  vec3 key = normalize(vec3(-0.5,0.7,0.9)); vec3 fill = normalize(vec3(0.7,-0.1,0.6));',
    '  float d = max(dot(n,key),0.0)*0.85 + max(dot(n,fill),0.0)*0.30 + 0.32;',
    '  float rim = pow(1.0 - max(dot(n,v),0.0), 3.0) * 0.25;',
    '  float spec = pow(max(dot(n, normalize(key+v)),0.0), 48.0) * 0.35;',
    '  vec3 lin = uColor * d + vec3(spec + rim);',
    '  gl_FragColor = vec4(pow(lin, vec3(1.0/2.2)), 1.0);',
    '}'
  ].join('\n');

  function shader(type, srcText) {
    var s = gl.createShader(type);
    gl.shaderSource(s, srcText); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  var loc = {
    pos: gl.getAttribLocation(prog, 'aPos'), nor: gl.getAttribLocation(prog, 'aNor'),
    model: gl.getUniformLocation(prog, 'uModel'), proj: gl.getUniformLocation(prog, 'uProj'), color: gl.getUniformLocation(prog, 'uColor')
  };
  var uintIdx = gl.getExtension('OES_element_index_uint');

  /* ---------- small matrix helpers (column-major) ---------- */
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function model(angle, tilt, dist) {
    var c = Math.cos(angle), s = Math.sin(angle), ct = Math.cos(tilt), st = Math.sin(tilt);
    // rotate about Y, then a slight fixed tilt about X, then push back from the camera
    return new Float32Array([
      c, s * st, -s * ct, 0,
      0, ct, st, 0,
      s, -c * st, c * ct, 0,
      0, 0, -dist, 1
    ]);
  }

  var parts = [];
  var angle = -0.35, omega = BASE, dragging = false, lastX = 0, lastT = 0, dragV = 0;
  var visible = true, running = false, prev = 0;

  function resize() {
    var r = host.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
  }

  function draw() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(loc.proj, false, perspective(0.52, canvas.width / canvas.height, 0.1, 20));
    gl.uniformMatrix4fv(loc.model, false, model(angle, 0.12, 4.6));
    parts.forEach(function (p) {
      gl.bindBuffer(gl.ARRAY_BUFFER, p.posBuf); gl.enableVertexAttribArray(loc.pos); gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, p.norBuf); gl.enableVertexAttribArray(loc.nor); gl.vertexAttribPointer(loc.nor, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, p.idxBuf);
      gl.uniform3fv(loc.color, p.color);
      gl.drawElements(gl.TRIANGLES, p.count, p.type, 0);
    });
  }

  function frame(t) {
    var dt = Math.min(0.05, (t - prev) / 1000 || 0);
    prev = t;
    var base = STILL.matches ? 0 : BASE;
    if (!dragging) {
      // a flick decays smoothly back to the slow turn (about a second and a half for a hard flick)
      omega += (base - omega) * (1 - Math.exp(-dt * 1.4));
      angle += omega * dt;
    }
    draw();
    var resting = STILL.matches && !dragging && Math.abs(omega) < 0.01;
    if (visible && !document.hidden && !resting) requestAnimationFrame(frame);
    else running = false;
  }
  function start() {
    if (running || !parts.length) return;
    running = true; prev = performance.now();
    requestAnimationFrame(frame);
  }

  /* ---------- drag, flick and keys ---------- */
  function down(e) {
    dragging = true; lastX = e.clientX; lastT = performance.now(); dragV = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    host.classList.add('is-grabbing');
    start();
  }
  function move(e) {
    if (!dragging) return;
    var now = performance.now();
    var dx = e.clientX - lastX, dts = Math.max(0.008, (now - lastT) / 1000);
    var turn = dx / host.getBoundingClientRect().width * Math.PI * 1.6;
    angle += turn;
    dragV = dragV * 0.5 + (turn / dts) * 0.5; // smoothed speed of the finger, in radians per second
    lastX = e.clientX; lastT = now;
    draw();
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    host.classList.remove('is-grabbing');
    if (performance.now() - lastT > 90) dragV = 0; // held still before letting go: no flick
    omega = Math.max(-MAX, Math.min(MAX, dragV));
    start();
  }
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      omega += (e.key === 'ArrowRight' ? 1 : -1) * 9;
      omega = Math.max(-MAX, Math.min(MAX, omega));
      start();
    }
  });

  /* ---------- load the model, then swap the PNG for the live canvas ---------- */
  fetch(src).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(function (buf) {
    parseGlb(buf).forEach(function (p) {
      var item = { color: p.color, count: p.idx.length };
      item.posBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, item.posBuf); gl.bufferData(gl.ARRAY_BUFFER, p.pos, gl.STATIC_DRAW);
      item.norBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, item.norBuf); gl.bufferData(gl.ARRAY_BUFFER, p.nor, gl.STATIC_DRAW);
      var idx = p.idx;
      if (idx instanceof Uint32Array && !uintIdx) idx = new Uint16Array(idx);
      item.type = idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      item.idxBuf = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, item.idxBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      parts.push(item);
    });
    canvas.className = 'block-m__canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'University of Michigan Block M in 3D. Drag or flick it to spin it; the arrow keys spin it too.');
    host.appendChild(canvas);
    host.classList.add('is-live');
    resize(); draw(); start();
    window.addEventListener('resize', function () { resize(); draw(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) start(); }).observe(host);
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) start(); });
    STILL.addEventListener && STILL.addEventListener('change', start);
  }).catch(function () { /* keep the PNG fallback */ });
  }
})();
