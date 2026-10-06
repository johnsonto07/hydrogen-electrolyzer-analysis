(function () {
  var F = 96485;      // C/mol
  var VM = 24000;     // mL/mol, near 20 °C and 1 atm
  var NS = 'http://www.w3.org/2000/svg';

  /* Theme toggle */
  var root = document.documentElement;
  var themeBtn = document.querySelector('[data-theme-toggle]');
  function isDark() {
    var t = root.getAttribute('data-theme');
    if (t) return t === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function label() { if (themeBtn) themeBtn.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme'); }
  if (themeBtn) {
    label();
    themeBtn.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      label();
    });
  }

  /* CSV */
  function parseCsv(text) {
    var lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
    var head = lines[0].split(',').map(function (h) { return h.trim(); });
    return lines.slice(1).map(function (line) {
      var v = line.split(','), r = {};
      head.forEach(function (h, i) { r[h] = (v[i] || '').trim(); });
      return r;
    });
  }

  function fitLine(xs, ys) {
    var n = xs.length, mx = 0, my = 0, sxx = 0, sxy = 0, syy = 0;
    xs.forEach(function (x, i) { mx += x; my += ys[i]; }); mx /= n; my /= n;
    xs.forEach(function (x, i) { sxx += (x - mx) * (x - mx); sxy += (x - mx) * (ys[i] - my); syy += (ys[i] - my) * (ys[i] - my); });
    var m = sxy / sxx;
    return { m: m, b: my - m * mx, r2: (sxy * sxy) / (sxx * syy) };
  }
  function mean(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
  function sd(a) { var m = mean(a); return Math.sqrt(a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / (a.length - 1)); }
  function pm(a, d) { return fmt(mean(a), d) + ' <span class="pm">± ' + fmt(sd(a), d) + '</span>'; }
  function fmt(v, d) { return v.toFixed(d); }

  /* Minimal SVG chart frame */
  function frame(el, o) {
    var cw = el.clientWidth || 560;
    var W = Math.max(330, Math.min(o.W || 560, Math.round(cw))), H = Math.round(W * (o.H || 340) / (o.W || 560)) + (W < 460 ? 30 : 0), L = 54, R = 18, T = 14, B = 46;
    var x = function (v) { return L + (v - o.x0) * (W - L - R) / (o.x1 - o.x0); };
    var y = function (v) { return T + (o.y1 - v) * (H - T - B) / (o.y1 - o.y0); };
    var s = '';
    o.yt.forEach(function (v) {
      s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
      s += '<text class="tick" x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + (o.yf ? o.yf(v) : v) + '</text>';
    });
    o.xt.forEach(function (v) {
      s += '<text class="tick" x="' + x(v) + '" y="' + (H - B + 19) + '" text-anchor="middle">' + (o.xf ? o.xf(v) : v) + '</text>';
    });
    s += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>';
    s += '<text class="alab" x="' + ((L + W - R) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + o.xl + '</text>';
    s += '<text class="alab" transform="translate(14 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">' + o.yl + '</text>';
    return {
      x: x, y: y, W: W, H: H, L: L, R: R, T: T, B: B,
      add: function (str) { s += str; },
      draw: function () { el.innerHTML = '<svg xmlns="' + NS + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' + s + '</svg>'; return el.querySelector('svg'); }
    };
  }
  function range(a, b, step) { var out = []; for (var v = a; v <= b + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000); return out; }

  function render(trials) {
    var volts = [];
    trials.forEach(function (t) { if (volts.indexOf(t.V) < 0) volts.push(t.V); });
    volts.sort(function (a, b) { return a - b; });
    var groups = volts.map(function (v) {
      var g = trials.filter(function (t) { return t.V === v; });
      return { V: v, I: mean(g.map(function (t) { return t.I; })), H: mean(g.map(function (t) { return t.H; })), P: mean(g.map(function (t) { return t.P; })), E: mean(g.map(function (t) { return t.E; })), trials: g,
        Is: g.map(function (t) { return t.I; }), Hs: g.map(function (t) { return t.H; }), Ps: g.map(function (t) { return t.P; }), Es: g.map(function (t) { return t.E; }) };
    });
    var best = trials.reduce(function (a, b) { return b.E > a.E ? b : a; });

    /* 1. Hero: H2 vs charge passed */
    var el = document.querySelector('[data-chart="charge"]');
    var tip = document.querySelector('[data-tip]');
    if (el) {
      var c = frame(el, { W: 560, H: 360, x0: 0, x1: 14, y0: 0, y1: 1.8, xt: range(0, 14, 2), yt: range(0, 1.8, 0.3), yf: function (v) { return v.toFixed(1); }, xl: 'Charge passed (C)', yl: 'Hydrogen (mL)' });
      var k = VM / (2 * F);
      c.add('<line class="theory" x1="' + c.x(0) + '" y1="' + c.y(0) + '" x2="' + c.x(14) + '" y2="' + c.y(14 * k) + '"/>');
      c.add('<text class="note" x="' + (c.x(12.6) - 6) + '" y="' + (c.y(12.6 * k) - 12) + '" text-anchor="end">100% efficient</text>');
      trials.forEach(function (t, i) {
        c.add('<circle class="pt" tabindex="0" data-i="' + i + '" cx="' + c.x(t.Q) + '" cy="' + c.y(t.H) + '" r="6"><title>Trial ' + t.n + ': ' + fmt(t.V, 1) + ' V, ' + fmt(t.H, 2) + ' mL, ' + fmt(t.E, 1) + '%</title></circle>');
      });
      var svg = c.draw();
      var show = function (e) {
        var i = e.target.getAttribute && e.target.getAttribute('data-i');
        if (i === null || i === undefined) return;
        var t = trials[+i];
        tip.textContent = 'Trial ' + t.n + ' at ' + fmt(t.V, 1) + ' V: ' + fmt(t.I, 3) + ' A for 60 s = ' + fmt(t.Q, 2) + ' C. Collected ' + fmt(t.H, 2) + ' mL of a predicted ' + fmt(t.P, 2) + ' mL (' + fmt(t.E, 1) + '%).';
      };
      svg.addEventListener('mouseover', show);
      svg.addEventListener('focusin', show);
      tip.textContent = 'Best trial: #' + best.n + ' at ' + fmt(best.V, 1) + ' V, ' + fmt(best.E, 1) + '% of the predicted hydrogen.';
    }

    /* 2. H2 vs current */
    el = document.querySelector('[data-chart="current"]');
    if (el) {
      var fit = fitLine(trials.map(function (t) { return t.I; }), trials.map(function (t) { return t.H; }));
      var c2 = frame(el, { x0: 0.04, x1: 0.23, y0: 0, y1: 1.8, xt: range(0.05, 0.22, 0.05).concat([]), yt: range(0, 1.8, 0.3), xf: function (v) { return v.toFixed(2); }, yf: function (v) { return v.toFixed(1); }, xl: 'Current (A)', yl: 'Hydrogen in 60 s (mL)' });
      var kt = 60 * VM / (2 * F);
      c2.add('<line class="theory" x1="' + c2.x(0.04) + '" y1="' + c2.y(0.04 * kt) + '" x2="' + c2.x(0.23) + '" y2="' + c2.y(0.23 * kt) + '"/>');
      c2.add('<line class="fit" x1="' + c2.x(0.04) + '" y1="' + c2.y(0.04 * fit.m + fit.b) + '" x2="' + c2.x(0.23) + '" y2="' + c2.y(0.23 * fit.m + fit.b) + '"/>');
      trials.forEach(function (t) { c2.add('<circle class="pt" cx="' + c2.x(t.I) + '" cy="' + c2.y(t.H) + '" r="5"><title>Trial ' + t.n + ': ' + fmt(t.I, 3) + ' A, ' + fmt(t.H, 2) + ' mL</title></circle>'); });
      c2.add('<text class="note" x="' + c2.x(0.215) + '" y="' + (c2.y(0.215 * kt) - 10) + '" text-anchor="end">Theory: ' + fmt(kt, 2) + ' mL/A</text>');
      c2.add('<text class="note" x="' + c2.x(0.225) + '" y="' + c2.y(0.2) + '" text-anchor="end">Fit: ' + fmt(fit.m, 2) + ' mL/A, R² = ' + fmt(fit.r2, 3) + '</text>');
      c2.draw();
    }

    /* 3. Efficiency by voltage */
    el = document.querySelector('[data-chart="eff"]');
    if (el) {
      var c3 = frame(el, { x0: 3.75, x1: 6.75, y0: 55, y1: 95, xt: volts, yt: range(60, 90, 10), xf: function (v) { return v.toFixed(1); }, yf: function (v) { return v + '%'; }, xl: 'Applied voltage (V)', yl: 'Faradaic efficiency' });
      c3.add('<rect class="zone" x="' + c3.x(5.75) + '" y="' + c3.T + '" width="' + (c3.x(6.75) - c3.x(5.75)) + '" height="' + (c3.H - c3.B - c3.T) + '"/>');
      c3.add('<text class="zlab" x="' + (c3.x(5.75) + 10) + '" y="' + (c3.T + 18) + '">Gas escaping</text>');
      c3.add('<polyline class="meanline" points="' + groups.map(function (g) { return c3.x(g.V) + ',' + c3.y(g.E); }).join(' ') + '"/>');
      trials.forEach(function (t, i) {
        var j = (i % 3 - 1) * 9;
        c3.add('<circle class="pt" cx="' + (c3.x(t.V) + j) + '" cy="' + c3.y(t.E) + '" r="4.5"><title>Trial ' + t.n + ': ' + fmt(t.E, 1) + '%</title></circle>');
      });
      groups.forEach(function (g) {
        c3.add('<circle class="mean" cx="' + c3.x(g.V) + '" cy="' + c3.y(g.E) + '" r="5.5"><title>' + fmt(g.V, 1) + ' V mean: ' + fmt(g.E, 1) + '%</title></circle>');
      });
      var pk = groups.reduce(function (a, b) { return b.E > a.E ? b : a; });
      c3.add('<text class="note" x="' + c3.x(pk.V) + '" y="' + (c3.y(pk.E) - 14) + '" text-anchor="middle">' + fmt(pk.E, 1) + '%</text>');
      c3.add('<text class="note" x="' + (c3.x(groups[0].V) + 12) + '" y="' + (c3.y(groups[0].E) + 4) + '">' + fmt(groups[0].E, 1) + '%</text>');
      c3.draw();
    }

    /* 4. Current vs voltage, extended to zero current */
    el = document.querySelector('[data-chart="iv"]');
    if (el) {
      var f4 = fitLine(trials.map(function (t) { return t.V; }), trials.map(function (t) { return t.I; }));
      var v0 = -f4.b / f4.m;
      var c4 = frame(el, { x0: 0, x1: 7, y0: 0, y1: 0.24, xt: range(0, 7, 1), yt: range(0, 0.24, 0.06), yf: function (v) { return v.toFixed(2); }, xl: 'Applied voltage (V)', yl: 'Current (A)' });
      c4.add('<line class="marker" x1="' + c4.x(1.23) + '" x2="' + c4.x(1.23) + '" y1="' + c4.T + '" y2="' + (c4.H - c4.B) + '"/>');
      c4.add('<text class="note" x="' + (c4.x(1.23) + 6) + '" y="' + (c4.T + 14) + '">1.23 V</text>');
      c4.add('<text class="alab" x="' + (c4.x(1.23) + 6) + '" y="' + (c4.T + 30) + '">theoretical minimum</text>');
      c4.add('<line class="ext" x1="' + c4.x(v0) + '" y1="' + c4.y(0) + '" x2="' + c4.x(4) + '" y2="' + c4.y(4 * f4.m + f4.b) + '"/>');
      c4.add('<line class="fit" x1="' + c4.x(4) + '" y1="' + c4.y(4 * f4.m + f4.b) + '" x2="' + c4.x(6.5) + '" y2="' + c4.y(6.5 * f4.m + f4.b) + '"/>');
      c4.add('<circle class="mean" cx="' + c4.x(v0) + '" cy="' + c4.y(0) + '" r="5"/>');
      c4.add('<text class="note" x="' + c4.x(v0) + '" y="' + (c4.y(0) - 14) + '" text-anchor="middle">' + fmt(v0, 1) + ' V</text>');
      trials.forEach(function (t) { c4.add('<circle class="pt" cx="' + c4.x(t.V) + '" cy="' + c4.y(t.I) + '" r="4.5"><title>Trial ' + t.n + ': ' + fmt(t.V, 1) + ' V, ' + fmt(t.I, 3) + ' A</title></circle>'); });
      c4.draw();
    }

    /* Tables */
    var sb = document.querySelector('[data-summary] tbody');
    if (sb) {
      sb.innerHTML = groups.map(function (g) {
        return '<tr' + (g.E === Math.max.apply(null, groups.map(function (x) { return x.E; })) ? ' class="best"' : '') + '><td>' + fmt(g.V, 1) + '</td><td>' + pm(g.Is, 3) + '</td><td>' + pm(g.Hs, 2) + '</td><td>' + pm(g.Ps, 2) + '</td><td>' + pm(g.Es, 1) + '</td></tr>';
      }).join('');
    }
    var rb = document.querySelector('[data-raw] tbody');
    if (rb) {
      rb.innerHTML = trials.map(function (t) {
        return '<tr' + (t === best ? ' class="best"' : '') + '><td>' + t.n + '</td><td>' + fmt(t.V, 1) + '</td><td>' + fmt(t.I, 3) + '</td><td>' + fmt(t.H, 2) + '</td><td>' + fmt(t.P, 3) + '</td><td>' + fmt(t.E, 1) + '</td><td class="note">' + t.note + '</td></tr>';
      }).join('');
    }
  }

  function fail() {
    var sb = document.querySelector('[data-summary] tbody');
    if (sb) sb.innerHTML = '<tr><td colspan="5">The data file didn\'t load. Download it with the links below.</td></tr>';
  }

  fetch('data/electrolysis_data.csv')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(function (text) {
      var trials = parseCsv(text).map(function (r) {
        var I = parseFloat(r['Current (A)']), time = parseFloat(r['Time (s)']), H = parseFloat(r['Hydrogen Volume (mL)']);
        var Q = I * time, P = Q / (2 * F) * VM;
        return { n: +r['Trial'], V: parseFloat(r['Voltage (V)']), I: I, H: H, Q: Q, P: P, E: H / P * 100, note: r['Notes'] || '' };
      }).filter(function (t) { return isFinite(t.V) && isFinite(t.I) && isFinite(t.H); });
      render(trials);
      var lastW = window.innerWidth, timer;
      window.addEventListener('resize', function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          if (Math.abs(window.innerWidth - lastW) < 40) return;
          lastW = window.innerWidth; render(trials);
        }, 200);
      });
    })
    .catch(fail);
})();
