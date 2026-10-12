/* Model section UI: sliders, readouts, and charts. All physics lives in model.js. */
(function () {
  var M = window.H2Model, C = window.SiteCharts;
  var form = document.querySelector('[data-model-form]');
  if (!M || !C || !form) return;
  var fmt = C.fmt, frame = C.frame, range = C.range;

  // Each control can appear twice (Model section "m-" and Lab section "x-"); both stay in sync.
  var controls = [
    { key: 'V', ids: ['m-V', 'x-V'], d: 2 },
    { key: 'c', ids: ['m-c', 'x-c'], d: 3 },
    { key: 'spacingMm', ids: ['m-s', 'x-s'], d: 0 },
    { key: 'areaMm2', ids: ['m-A', 'x-A'], d: 0 }
  ];
  var state = {}, base = {}, trials = [], listeners = [];
  controls.forEach(function (ctl) { ctl.ids = ctl.ids.filter(function (id) { return document.getElementById(id); }); });

  // Shared with lab.js so the apparatus animation follows the same settings
  window.ModelBus = {
    state: state,
    get trials() { return trials; },
    onChange: function (fn) { listeners.push(fn); },
    set: function (key, v) { controls.forEach(function (ctl) { if (ctl.key === key) setControl(ctl, v); }); draw(); }
  };

  function expDefaults() {
    return { V: M.defaults.V, c: M.fitted.cEff, spacingMm: M.defaults.spacingMm, areaMm2: M.defaults.areaMm2 };
  }
  function clamp(v, el) { return Math.min(+el.max, Math.max(+el.min, v)); }
  function setControl(ctl, v, skip) {
    v = clamp(v, document.getElementById(ctl.ids[0]));
    state[ctl.key] = v;
    ctl.ids.forEach(function (id) {
      var num = document.getElementById(id), sl = document.getElementById(id + '-r');
      if (num !== skip) num.value = fmt(v, ctl.d);
      sl.value = v;
    });
  }

  /* Ticks that land on round numbers for an axis from 0 to max */
  function niceMax(v, n) {
    var raw = v / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    var step = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
    return { max: step * Math.ceil(v / step - 1e-9), step: step };
  }
  function dec(step) { return Math.max(0, -Math.floor(Math.log10(step) + 1e-9)); }
  function path(pts, c) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + c.x(p[0]).toFixed(1) + ' ' + c.y(p[1]).toFixed(1); }).join(''); }
  function sci(v) {
    var e = Math.floor(Math.log10(v)), m = v / Math.pow(10, e);
    var sup = String(e).replace(/-/g, '⁻').replace(/\d/g, function (d) { return '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]; });
    return fmt(m, 1) + ' × 10' + sup;
  }
  function sameAsBase() { return ['c', 'spacingMm', 'areaMm2'].every(function (k) { return Math.abs(state[k] - base[k]) < 1e-9; }); }

  function curve(p, v0, v1) {
    var out = [];
    for (var v = v0; v <= v1 + 1e-9; v += 0.025) out.push(M.solve({ V: v, c: p.c, spacingMm: p.spacingMm, areaMm2: p.areaMm2 }));
    return out;
  }

  function draw() {
    var op = M.solve({ V: state.V, c: state.c, spacingMm: state.spacingMm, areaMm2: state.areaMm2 });
    listeners.forEach(function (fn) { fn(state, op); });
    var showBase = !sameAsBase();
    var now = curve(state, 1, 7), ref = showBase ? curve(base, 1, 7) : null;

    /* Readouts */
    var out = function (k, html) { var el = document.querySelector('[data-out="' + k + '"]'); if (el) el.innerHTML = html; };
    out('I', op.I >= 0.01 ? fmt(op.I, 3) + ' A' : op.I >= 1e-4 ? fmt(op.I * 1000, 2) + ' mA' : op.I > 0 ? (op.I * 1e6).toPrecision(2) + ' µA' : '0 A');
    out('rate', fmt(op.rateMlS * 60, 2) + ' mL/min');
    out('vol', fmt(op.volMl, 2) + ' mL');
    out('veff', op.I > 0 ? fmt(op.voltEff * 100, 1) + '%' : '–');
    out('energy', op.I > 0 ? fmt(op.kWhPerKg, 0) + ' / ' + fmt(op.kWhPerKg / M.MARGINAL_FE, 0) + ' kWh/kg' : '–');

    /* 1. Current vs voltage */
    var el = document.querySelector('[data-chart="m-iv"]');
    var yMaxI = Math.max(0.22, now[now.length - 1].I, ref ? ref[ref.length - 1].I : 0) * 1.05;
    var nI = niceMax(yMaxI, 4);
    var c1 = frame(el, { W: 560, H: 330, x0: 1, x1: 7, y0: 0, y1: nI.max, xt: range(1, 7, 1), yt: range(0, nI.max, nI.step),
      yf: function (v) { return v.toFixed(dec(nI.step)); }, xl: 'Applied voltage (V)', yl: 'Current (A)' });
    c1.add('<line class="marker" x1="' + c1.x(M.eRev(M.T_K)) + '" x2="' + c1.x(M.eRev(M.T_K)) + '" y1="' + c1.T + '" y2="' + (c1.H - c1.B) + '"/>');
    c1.add('<text class="alab" x="' + (c1.x(M.eRev(M.T_K)) + 6) + '" y="' + (c1.T + 12) + '">E<tspan baseline-shift="sub" font-size="9">rev</tspan> 1.23 V</text>');
    if (ref) c1.add('<path class="theory" d="' + path(ref.map(function (s) { return [s.V, s.I]; }), c1) + '"/>');
    c1.add('<path class="model" d="' + path(now.map(function (s) { return [s.V, s.I]; }), c1) + '"/>');
    trials.forEach(function (t) { c1.add('<circle class="pt" cx="' + c1.x(t.V) + '" cy="' + c1.y(t.I) + '" r="4"><title>Trial ' + t.n + ': ' + fmt(t.V, 1) + ' V, ' + fmt(t.I, 3) + ' A</title></circle>'); });
    c1.add('<line class="sel" x1="' + c1.x(op.V) + '" x2="' + c1.x(op.V) + '" y1="' + c1.T + '" y2="' + (c1.H - c1.B) + '"/>');
    c1.add('<circle class="mean" cx="' + c1.x(op.V) + '" cy="' + c1.y(op.I) + '" r="5"><title>Model: ' + fmt(op.V, 2) + ' V, ' + fmt(op.I, 3) + ' A</title></circle>');
    c1.draw();

    /* 3. H2 volume vs voltage */
    el = document.querySelector('[data-chart="m-h2"]');
    var vNow = now.filter(function (s) { return s.V >= 3 - 1e-9; });
    var vRef = ref ? ref.filter(function (s) { return s.V >= 3 - 1e-9; }) : null;
    var yMaxH = Math.max(1.6, vNow[vNow.length - 1].volMl, vRef ? vRef[vRef.length - 1].volMl : 0) * 1.05;
    var nH = niceMax(yMaxH, 4);
    var c3 = frame(el, { W: 560, H: 330, x0: 3, x1: 7, y0: 0, y1: nH.max, xt: range(3, 7, 1), yt: range(0, nH.max, nH.step),
      yf: function (v) { return v.toFixed(dec(nH.step)); }, xl: 'Applied voltage (V)', yl: 'Hydrogen in 60 s (mL)' });
    c3.add('<rect class="zone" x="' + c3.x(5.75) + '" y="' + c3.T + '" width="' + (c3.x(7) - c3.x(5.75)) + '" height="' + (c3.H - c3.B - c3.T) + '"/>');
    c3.add('<text class="zlab" x="' + (c3.x(5.75) + 6) + '" y="' + (c3.T + 14) + '">Gas escaping</text>');
    if (vRef) c3.add('<path class="theory" d="' + path(vRef.map(function (s) { return [s.V, s.volMl]; }), c3) + '"/>');
    c3.add('<path class="model90" d="' + path(vNow.map(function (s) { return [s.V, s.volMl * M.MARGINAL_FE]; }), c3) + '"/>');
    c3.add('<path class="model" d="' + path(vNow.map(function (s) { return [s.V, s.volMl]; }), c3) + '"/>');
    trials.forEach(function (t) { c3.add('<circle class="pt" cx="' + c3.x(t.V) + '" cy="' + c3.y(t.H) + '" r="4"><title>Trial ' + t.n + ': ' + fmt(t.V, 1) + ' V, ' + fmt(t.H, 2) + ' mL</title></circle>'); });
    if (op.V >= 3) {
      c3.add('<line class="sel" x1="' + c3.x(op.V) + '" x2="' + c3.x(op.V) + '" y1="' + c3.T + '" y2="' + (c3.H - c3.B) + '"/>');
      c3.add('<circle class="mean" cx="' + c3.x(op.V) + '" cy="' + c3.y(op.volMl) + '" r="5"><title>Model: ' + fmt(op.volMl, 2) + ' mL at 100%</title></circle>');
    }
    c3.draw();

    /* 2. Stacked voltage breakdown at the selected voltage */
    el = document.querySelector('[data-chart="m-bar"]');
    var narrow = (el.clientWidth || 560) < 460;
    var c2 = frame(el, { W: narrow ? 560 : 1000, H: narrow ? 120 : 125, x0: 0, x1: 7, y0: 0, y1: 1, xt: range(0, 7, 1), yt: [], xf: function (v) { return v + ' V'; }, xl: '', yl: '' });
    var segs = op.I > 0
      ? [['rev', 'Reversible', op.Erev], ['act', 'Activation', op.activation], ['ohm', 'Ohmic', op.ohmic]]
      : [['rev', 'Below E_rev: no current', op.V]];
    var x0 = 0, top = c2.T + 4, h = c2.H - c2.B - c2.T - 8;
    segs.forEach(function (sg) {
      var w = c2.x(x0 + sg[2]) - c2.x(x0);
      c2.add('<rect class="seg seg-' + sg[0] + '" x="' + c2.x(x0) + '" y="' + top + '" width="' + Math.max(0, w) + '" height="' + h + '"><title>' + sg[1] + ': ' + fmt(sg[2], 2) + ' V</title></rect>');
      if (w > 46) c2.add('<text class="seglab" x="' + (c2.x(x0) + w / 2) + '" y="' + (top + h / 2 + 4) + '" text-anchor="middle">' + fmt(sg[2], 2) + ' V</text>');
      x0 += sg[2];
    });
    c2.draw();
    var cap = document.querySelector('[data-bar-cap]');
    if (cap) cap.innerHTML = '<span class="nw"><span class="key key-sw key-rev"></span>Reversible</span> <span class="nw"><span class="key key-sw key-act"></span>Activation, both electrodes</span> <span class="nw"><span class="key key-sw key-ohm"></span>Ohmic, I·R<sub>Ω</sub> = ' + fmt(op.I, 3) + ' A × ' + fmt(op.R, 1) + ' Ω</span>';
  }

  function wire() {
    controls.forEach(function (ctl) {
      ctl.ids.forEach(function (id) {
        var num = document.getElementById(id), sl = document.getElementById(id + '-r');
        sl.addEventListener('input', function () { setControl(ctl, +sl.value); draw(); });
        num.addEventListener('change', function () {
          var v = parseFloat(num.value);
          if (!isFinite(v)) v = state[ctl.key];
          setControl(ctl, v); draw();
        });
        num.addEventListener('input', function () {
          var v = parseFloat(num.value);
          if (isFinite(v) && v >= +num.min && v <= +num.max) { setControl(ctl, v, num); draw(); }
        });
      });
    });
    document.querySelectorAll('[data-model-reset]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = expDefaults(); controls.forEach(function (ctl) { setControl(ctl, d[ctl.key]); }); draw();
      });
    });
    var lastW = window.innerWidth, timer;
    window.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { if (Math.abs(window.innerWidth - lastW) < 40) return; lastW = window.innerWidth; draw(); }, 200);
    });
  }

  fetch('data/electrolysis_data.csv')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(function (text) {
      trials = C.parseCsv(text).map(function (r) {
        return { n: +r['Trial'], V: parseFloat(r['Voltage (V)']), I: parseFloat(r['Current (A)']), H: parseFloat(r['Hydrogen Volume (mL)']) };
      }).filter(function (t) { return isFinite(t.V) && isFinite(t.I) && isFinite(t.H); });

      var f = M.fit(trials);
      base = expDefaults();
      controls.forEach(function (ctl) { setControl(ctl, base[ctl.key]); });

      // Largest gap between modeled and mean measured current, by voltage
      var volts = [];
      trials.forEach(function (t) { if (volts.indexOf(t.V) < 0) volts.push(t.V); });
      var maxDev = 0;
      volts.forEach(function (v) {
        var g = trials.filter(function (t) { return t.V === v; });
        var m = g.reduce(function (a, t) { return a + t.I; }, 0) / g.length;
        maxDev = Math.max(maxDev, Math.abs(M.solve({ V: v }).I / m - 1));
      });
      var fill = document.querySelector('[data-fill="maxdev"]');
      if (fill) fill.textContent = fmt(maxDev * 100, 0) + '%';

      var fp = document.querySelector('[data-fitted]');
      if (fp) fp.innerHTML = '<span class="tag">fitted</span> Least squares on the 18 trials: NaHCO₃ ' + fmt(f.cEff, 3) + ' ± ' + fmt(f.cEffSE, 3) +
        ' mol/L (effective) and j₀ = ' + sci(f.j0) + ' A/cm² (within a factor of ' + fmt(Math.pow(10, f.seLogJ0), 1) + ').';

      wire();
      draw();
    })
    .catch(function () {
      var fp = document.querySelector('[data-fitted]');
      if (fp) fp.textContent = 'The data file did not load, so the model could not be fitted.';
    });
})();
