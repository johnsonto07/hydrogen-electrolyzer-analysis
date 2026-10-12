/* "Run the experiment": an animated drawing of the apparatus driven by model.js.
   Settings come from the shared sliders (model-ui.js, window.ModelBus). Nothing here is
   new physics: current comes from H2Model.solve, gas volume from Faraday's law. */
(function () {
  var M = window.H2Model, bus = window.ModelBus;
  var host = document.querySelector('[data-lab-scene]');
  if (!M || !bus || !host) return;

  var NS = 'http://www.w3.org/2000/svg';
  var VW = 640, VH = 400;                 // SVG viewBox
  var TUBE_R = 5;                         // collection tube inner radius, mm
  var ROD_R = M.ROD_D_MM / 2;             // graphite rod radius, mm
  var MOUTH = 10;                         // tube mouth height above the beaker floor, mm
  var MM_PER_ML = 1000 / (Math.PI * TUBE_R * TUBE_R); // gas column height per mL in the tube
  var RUN_S = 60;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var st = { V: M.defaults.V, spacingMm: M.defaults.spacingMm, areaMm2: M.defaults.areaMm2 };
  var op = { I: 0, V: st.V };
  var run = { on: false, t: 0, q: 0, done: false, vStart: null, vChanged: false, full: false };
  var geo = null, els = {}, bubbles = [], pool = [], lastFrame = 0, raf = 0, visible = true, spawnAcc = [0, 0];

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function f(v, d) { return v.toFixed(d); }

  /* ---------- geometry in mm, then scaled into the drawing ---------- */
  function layout() {
    var L = M.lengthFromArea(st.areaMm2);                 // immersed rod length, mm
    var rodTop = MOUTH + L;                               // rod runs up inside the tube from its mouth
    var tubeTop = rodTop + 30;                            // headspace for the collected gas
    var liq = Math.max(58, rodTop + 6);                   // electrolyte depth (500 mL in a 1000 mL beaker is about 58 mm)
    var Hb = Math.max(liq + 26, tubeTop + 10);            // beaker height
    var Wb = Math.max(110, st.spacingMm + 2 * (TUBE_R + 1) + 50); // beaker width, with room for labels
    var sDraw = Math.max(st.spacingMm, 2 * TUBE_R + 4);   // tubes can't overlap in the drawing even when the model spacing is tiny
    var k = Math.min(380 / (Wb + 8), 300 / (Hb + 6), 3.2);       // px per mm
    var cx = 430, by = 366;                               // beaker center x, inside floor y (px)
    return {
      L: L, rodTop: rodTop, tubeTop: tubeTop, liq: liq, Hb: Hb, Wb: Wb, k: k, cx: cx, by: by,
      X: function (mm) { return cx + mm * k; },           // horizontal mm from beaker center -> px
      Y: function (mm) { return by - mm * k; },           // height mm above beaker floor -> px
      xs: [-sDraw / 2, sDraw / 2]                         // cathode (left), anode (right)
    };
  }

  /* ---------- static drawing (rebuilt when spacing or area changes) ---------- */
  function build() {
    geo = layout();
    var g = geo, X = g.X, Y = g.Y, k = g.k;
    host.innerHTML = '';
    var svg = el('svg', { viewBox: '0 0 ' + VW + ' ' + VH, class: 'lab-svg', 'aria-hidden': 'true' }, host);

    el('line', { x1: 0, x2: VW, y1: g.by + 6, y2: g.by + 6, class: 'bench' }, svg);

    /* Power supply */
    var ps = el('g', { class: 'psu' }, svg);
    el('rect', { x: 14, y: 148, width: 164, height: 216, rx: 10, class: 'psu-body' }, ps);
    el('rect', { x: 28, y: 162, width: 136, height: 112, rx: 4, class: 'psu-lcd' }, ps);
    els.lcdV = el('text', { x: 140, y: 196, class: 'seg', 'text-anchor': 'end' }, ps);
    els.lcdA = el('text', { x: 140, y: 230, class: 'seg', 'text-anchor': 'end' }, ps);
    els.lcdW = el('text', { x: 140, y: 264, class: 'seg', 'text-anchor': 'end' }, ps);
    ['V', 'A', 'W'].forEach(function (u, i) { el('text', { x: 148, y: 194 + 34 * i, class: 'seg-u' }, ps).textContent = u; });
    el('text', { x: 36, y: 180, class: 'psu-lab' }, ps).textContent = 'C.V';
    els.led = el('circle', { cx: 40, cy: 188, r: 3, class: 'led' }, ps);
    [[56, 302], [134, 302]].forEach(function (p) { el('circle', { cx: p[0], cy: p[1], r: 13, class: 'knob' }, ps); });
    el('text', { x: 96, y: 306, class: 'psu-lab', 'text-anchor': 'middle' }, ps).textContent = 'OUTPUT';
    el('circle', { cx: 56, cy: 342, r: 8, class: 'term-neg' }, ps);
    el('circle', { cx: 134, cy: 342, r: 8, class: 'term-pos' }, ps);
    el('text', { x: 56, y: 360, class: 'psu-lab', 'text-anchor': 'middle' }, ps).textContent = '−';
    el('text', { x: 134, y: 360, class: 'psu-lab', 'text-anchor': 'middle' }, ps).textContent = '+';

    /* Beaker and electrolyte */
    var left = X(-g.Wb / 2), right = X(g.Wb / 2), top = Y(g.Hb);
    el('rect', { x: left, y: Y(g.liq), width: right - left, height: g.liq * k, class: 'liquid' }, svg);
    el('line', { x1: left, x2: right, y1: Y(g.liq), y2: Y(g.liq), class: 'meniscus' }, svg);

    /* Wires: from the supply terminals along the bench, up the outside of the beaker,
       over the rim, and down inside to the clips at the bottom of each rod.
       Cathode (black, -) goes over the left rim; anode (red, +) runs past the beaker and over the right rim. */
    function wire(i, cls, tx, ty) {
      var x = X(g.xs[i]), clipY = Y(MOUTH - 4) + 4, benchY = g.by + 3 + i * 2;
      var outX = i === 0 ? left - 26 : right + 26, inX = i === 0 ? left + 7 : right - 7, dir = i === 0 ? 1 : -1;
      var d = 'M' + tx + ' ' + ty + ' Q' + tx + ' ' + benchY + ' ' + (tx + 18) + ' ' + benchY +
        ' L' + (outX - 12) + ' ' + benchY + ' Q' + outX + ' ' + benchY + ' ' + outX + ' ' + (benchY - 12) +
        ' L' + outX + ' ' + (top + 4) + ' Q' + outX + ' ' + (top - 14) + ' ' + ((outX + inX) / 2) + ' ' + (top - 14) +
        ' Q' + inX + ' ' + (top - 14) + ' ' + inX + ' ' + (top + 4) +
        ' L' + inX + ' ' + (clipY - 10) + ' Q' + inX + ' ' + clipY + ' ' + (inX + 10 * dir) + ' ' + clipY + ' L' + x + ' ' + clipY;
      el('path', { d: d, class: 'wire ' + cls }, svg);
    }
    wire(1, 'wire-pos', 134, 350);
    wire(0, 'wire-neg', 56, 350);

    els.gas = []; els.tubeLiq = []; els.surf = [];
    g.xs.forEach(function (xm, i) {
      var x = X(xm), tw = TUBE_R * k, tTop = Y(g.tubeTop), mouth = Y(MOUTH);
      /* liquid held up inside the inverted tube, then the gas pocket at its top, both clipped to the tube's inside */
      var cid = 'labtube' + i + '-' + Math.round(Math.random() * 1e6);
      var cp = el('clipPath', { id: cid }, svg);
      el('path', { d: 'M' + (x - tw) + ' ' + mouth + ' L' + (x - tw) + ' ' + (tTop + tw) + ' A' + tw + ' ' + tw + ' 0 0 1 ' + (x + tw) + ' ' + (tTop + tw) + ' L' + (x + tw) + ' ' + mouth + ' Z' }, cp);
      els.tubeLiq[i] = el('rect', { x: x - tw, y: tTop, width: 2 * tw, height: mouth - tTop, class: 'liquid', 'clip-path': 'url(#' + cid + ')' }, svg);
      els.gas[i] = el('rect', { x: x - tw, y: tTop, width: 2 * tw, height: 0, class: 'gas', 'clip-path': 'url(#' + cid + ')' }, svg);
      els.surf[i] = el('line', { x1: x - tw, x2: x + tw, y1: tTop, y2: tTop, class: 'gas-line' }, svg);
      /* graphite rod and clip */
      el('rect', { x: x - ROD_R * k, y: Y(g.rodTop), width: 2 * ROD_R * k, height: (g.rodTop - (MOUTH - 4)) * k, rx: 1.5, class: 'rod' }, svg);
      el('rect', { x: x - 5 * k / 1.6, y: Y(MOUTH - 4) - 2, width: 10 * k / 1.6, height: 8, rx: 2, class: i === 0 ? 'clip clip-neg' : 'clip clip-pos' }, svg);
      /* tube glass: open mouth at the bottom, rounded closed top */
      var r = tw + 1.2;
      el('path', { d: 'M' + (x - r) + ' ' + mouth + ' L' + (x - r) + ' ' + (tTop + r) + ' A' + r + ' ' + r + ' 0 0 1 ' + (x + r) + ' ' + (tTop + r) + ' L' + (x + r) + ' ' + mouth, class: 'glass tube' }, svg);
      /* graduations every 0.5 mL from the top */
      for (var v = 0.5; v * MM_PER_ML < g.tubeTop - g.rodTop - 2; v += 0.5) {
        var gy = Y(g.tubeTop - v * MM_PER_ML), whole = Math.abs(v - Math.round(v)) < 1e-9;
        el('line', { x1: x + r - (whole ? 7 : 4), x2: x + r, y1: gy, y2: gy, class: 'grad' }, svg);
        if (whole) el('text', { x: x + r + 3, y: gy + 3.5, class: 'grad-t' }, svg).textContent = v + ' mL';
      }
      el('text', { x: x, y: tTop - 16, class: 'elab', 'text-anchor': 'middle' }, svg).textContent = i === 0 ? 'Cathode (−)' : 'Anode (+)';
      el('text', { x: x, y: tTop - 4, class: 'elab-g', 'text-anchor': 'middle' }, svg).textContent = i === 0 ? 'H₂' : 'O₂';
    });

    els.bub = el('g', { class: 'bubbles' }, svg);
    bubbles = []; pool = [];

    /* beaker glass drawn last so it sits over the liquid */
    el('path', { d: 'M' + (left - 6) + ' ' + (top - 4) + ' Q' + left + ' ' + (top - 2) + ' ' + left + ' ' + (top + 6) + ' L' + left + ' ' + (g.by - 6) +
      ' Q' + left + ' ' + g.by + ' ' + (left + 6) + ' ' + g.by + ' L' + (right - 6) + ' ' + g.by + ' Q' + right + ' ' + g.by + ' ' + right + ' ' + (g.by - 6) +
      ' L' + right + ' ' + top, class: 'glass beaker' }, svg);
    /* beaker volume marks: the 500 mL line sits at the electrolyte surface (about 58 mm in a 1000 mL beaker) */
    var roomPx = (g.Wb / 2 - Math.abs(g.xs[0]) - TUBE_R - 1.2) * k;   // gap between beaker wall and tube
    [[58, '500 mL'], [Math.min(g.Hb - 8, 116), '1000 mL']].forEach(function (m) {
      if (m[0] > g.Hb - 4) return;
      el('line', { x1: left + 2, x2: left + 16, y1: Y(m[0]), y2: Y(m[0]), class: 'grad' }, svg);
      if (roomPx > 64) el('text', { x: left + 19, y: Y(m[0]) + 3.5, class: 'grad-t' }, svg).textContent = m[1];
    });
    if (roomPx > 64) el('text', { x: right - 8, y: Y(g.liq) + 18, class: 'grad-t', 'text-anchor': 'end' }, svg).textContent = 'NaHCO₃(aq)';
    update();
  }

  /* ---------- per-frame state ---------- */
  function h2ml() { return run.q / (2 * M.F) * M.VM_ML; }        // Faraday's law, 2 e- per H2
  function currentNow() { return run.on ? op.I : 0; }

  function update() {
    if (!geo) return;
    var I = currentNow(), k = geo.k;
    els.lcdV.textContent = ('0' + f(st.V, 2)).slice(-5);
    els.lcdA.textContent = f(I, 3);
    els.lcdW.textContent = f(I * st.V, 3);
    els.led.setAttribute('class', run.on ? 'led led-on' : 'led');
    var vols = [h2ml(), h2ml() / 2];                       // O2: 4 e- per O2, so half the H2 volume
    vols.forEach(function (v, i) {
      var h = Math.min(v * MM_PER_ML, geo.tubeTop - geo.rodTop - 1);
      geo['surf' + i] = geo.tubeTop - h;
      els.gas[i].setAttribute('height', (h * k).toFixed(2));
      var sy = geo.Y(geo.tubeTop - h).toFixed(1);
      els.surf[i].setAttribute('y1', sy); els.surf[i].setAttribute('y2', sy);
      els.surf[i].style.display = h > 0.3 ? '' : 'none';
    });
    var set = function (k2, s) { var e = document.querySelector('[data-lab="' + k2 + '"]'); if (e) e.textContent = s; };
    set('t', f(run.t, 1) + ' s');
    set('q', f(run.q, 2) + ' C');
    set('h2', f(vols[0], 2) + ' mL');
    set('o2', f(vols[1], 2) + ' mL');
  }

  /* ---------- bubbles ---------- */
  function spawn(i) {
    var c = pool.pop() || el('circle', {}, null);
    var b = {
      i: i, el: c,
      x: geo.xs[i] + (Math.random() < 0.5 ? -1 : 1) * (ROD_R + 0.3 + Math.random() * 0.8),
      y: MOUTH + 1 + Math.random() * (geo.rodTop - MOUTH - 1),
      r: (i === 0 ? 0.45 : 0.6) + Math.random() * 0.6,
      v: 16 + Math.random() * 14, ph: Math.random() * 6.28
    };
    c.setAttribute('class', 'bub');
    els.bub.appendChild(c);
    bubbles.push(b);
  }
  function stepBubbles(dt) {
    var I = currentNow();
    if (!reduceMotion && I > 0) {
      [700, 350].forEach(function (rate, i) {             // bubbles per second per amp (visual only)
        spawnAcc[i] += Math.min(160, I * rate) * dt;
        while (spawnAcc[i] >= 1) { spawnAcc[i] -= 1; if (bubbles.length < 260) spawn(i); }
      });
    }
    for (var n = bubbles.length - 1; n >= 0; n--) {
      var b = bubbles[n];
      b.y += b.v * dt; b.ph += dt * 9;
      var maxX = TUBE_R - b.r - 0.2;
      var bx = Math.max(-maxX, Math.min(maxX, b.x - geo.xs[b.i] + Math.sin(b.ph) * 0.35)) + geo.xs[b.i];
      if (b.y >= (geo['surf' + b.i] || geo.tubeTop) - b.r) {
        els.bub.removeChild(b.el); pool.push(b.el); bubbles.splice(n, 1); continue;
      }
      b.el.setAttribute('cx', geo.X(bx).toFixed(1));
      b.el.setAttribute('cy', geo.Y(b.y).toFixed(1));
      b.el.setAttribute('r', (b.r * geo.k).toFixed(2));
    }
  }

  /* ---------- run control ---------- */
  var runBtn = document.querySelector('[data-lab-run]');
  var fast = document.querySelector('[data-lab-fast]');
  var cmp = document.querySelector('[data-lab-compare]');

  function trialsAt(V) { return bus.trials.filter(function (t) { return Math.abs(t.V - V) < 0.01; }); }
  function atExperiment() {
    var s = bus.state;
    return Math.abs(s.c - M.fitted.cEff) < 1e-6 && s.spacingMm === M.defaults.spacingMm && s.areaMm2 === M.defaults.areaMm2;
  }
  function compareText() {
    var tr = trialsAt(st.V);
    var list = tr.map(function (t) { return f(t.H, 2); }).join(', ');
    var expNote = atExperiment() ? '' : ' Your cell settings differ from the experiment, so treat these as a reference only.';
    if (run.full) return 'H₂ filled the tube down to the top of the rod at ' + f(run.t, 1) + ' s, so the run stopped there. In a real cell the current would drop as the rod is uncovered.';
    if (!run.done) {
      if (!tr.length) return 'You measured 4.0 to 6.5 V in 0.5 V steps; ' + f(st.V, 2) + ' V has no matching trial.';
      return 'Your three trials at ' + f(st.V, 1) + ' V collected ' + list + ' mL of H₂ in 60 s.' + expNote;
    }
    var out = 'Run complete: the model collected ' + f(h2ml(), 2) + ' mL of H₂, assuming every electron makes H₂. ';
    if (run.vChanged) return out + 'The voltage changed during the run, so no measured trial matches it.';
    if (!tr.length) return out + 'There is no measured trial at ' + f(st.V, 2) + ' V to compare with.';
    var eff = tr.map(function (t) { return t.H / h2ml() * 100; });
    return out + 'Your trials at ' + f(st.V, 1) + ' V collected ' + list + ' mL, ' + f(Math.min.apply(null, eff), 0) + ' to ' + f(Math.max.apply(null, eff), 0) + '% of this run.' + expNote;
  }
  function setBtn() { runBtn.textContent = run.on ? 'Stop' : run.done || run.full ? 'Run again' : run.t > 0 ? 'Resume' : 'Run 60 s'; }
  function refill() { run = { on: false, t: 0, q: 0, done: false, vStart: null, vChanged: false, full: false }; bubbles.forEach(function (b) { els.bub.removeChild(b.el); pool.push(b.el); }); bubbles = []; update(); setBtn(); cmp.textContent = compareText(); }

  runBtn.addEventListener('click', function () {
    if (run.on) { run.on = false; }
    else {
      if (run.done || run.full) refill();
      run.on = true; if (run.vStart === null) run.vStart = st.V;
      kick();
    }
    setBtn(); update(); cmp.textContent = compareText();
  });
  document.querySelector('[data-lab-empty]').addEventListener('click', refill);

  function frame(ts) {
    raf = 0;
    var dt = lastFrame ? Math.min(0.05, (ts - lastFrame) / 1000) : 0;
    lastFrame = ts;
    if (run.on) {
      var sim = dt * (fast && fast.checked ? 10 : 1);
      if (run.t + sim >= RUN_S) { sim = RUN_S - run.t; run.on = false; run.done = true; }
      run.t += sim; run.q += op.I * sim;                    // charge = current x time
      if (h2ml() * MM_PER_ML >= geo.tubeTop - geo.rodTop - 1) { run.on = false; run.full = true; } // gas has reached the top of the rod
      if (!run.on) { setBtn(); cmp.textContent = compareText(); }
    }
    stepBubbles(dt);
    update();
    if ((run.on || bubbles.length) && visible) raf = requestAnimationFrame(frame);
    else lastFrame = 0;
  }
  function kick() { if (!raf) { lastFrame = 0; raf = requestAnimationFrame(frame); } }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }).observe(host);
  }

  bus.onChange(function (s, o) {
    var rebuild = !geo || s.spacingMm !== st.spacingMm || s.areaMm2 !== st.areaMm2;
    if (run.on && Math.abs(s.V - st.V) > 1e-9) run.vChanged = true;
    st = { V: s.V, spacingMm: s.spacingMm, areaMm2: s.areaMm2 };
    op = o;
    if (rebuild) build(); else update();
    if (!run.on) cmp.textContent = compareText();
  });

  build();
  cmp.textContent = '';
})();
