/*
  model.js: steady-state model of the two-electrode graphite / NaHCO3 electrolysis cell.

  This file only does math. It never touches the page, so the same code runs in
  index.html (the interactive Model section), in test.html (the checks), and in Node.

  Big picture: the voltage you apply is spent on three things in series.
    V_applied = E_rev + eta_anode + eta_cathode + I * R_ohm
  E_rev is the thermodynamic minimum, the two etas are the extra "push" the
  electrode reactions need (activation overpotentials), and I*R_ohm is the voltage
  lost driving ions through the electrolyte. Current I appears on the right side in
  three places, so we can't rearrange for I directly. We solve it numerically.

  See MODEL_NOTES.md for the full derivation, assumptions, and limitations.
*/
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 1. Physical constants (from literature or exact definitions)        */
  /* ------------------------------------------------------------------ */

  // Faraday constant, coulombs per mole of electrons.
  // Source: CODATA 2018 (exact, since e and N_A are defined exactly).
  var F = 96485.33212;

  // Universal gas constant, J/(mol K). Source: CODATA 2018 (exact).
  var R_GAS = 8.314462618;

  // Molar mass of H2, g/mol. Source: IUPAC standard atomic weight of H (1.008) x 2.
  var M_H2 = 2.016;

  // Molar volume of gas used to convert moles of H2 to mL, mL/mol.
  // 24.0 L/mol is the ideal-gas value near 20 C and 1 atm (RT/P = 24.05 L/mol).
  // We use 24.0 so the model matches the Theory section and the existing charts exactly.
  var VM_ML = 24000;

  // Cell temperature, K. Not measured; assumed 20 C (same assumption as V_m above).
  var T_K = 293.15;

  // Reversible (equilibrium) cell voltage for 2 H2O(l) -> 2 H2 + O2 at T.
  // At 25 C: E_rev = dG / (nF) = 237,130 J/mol / (2 x 96,485 C/mol) = 1.229 V.
  // Temperature slope: dE/dT = dS / (nF) = -163.3 J/(mol K) / (2F) = -0.000846 V/K,
  // so the cell needs slightly MORE voltage at 20 C than at 25 C.
  // Source: standard Gibbs energy and entropies of H2O(l), H2(g), O2(g) from the
  // CRC Handbook of Chemistry and Physics, "Standard Thermodynamic Properties of
  // Chemical Substances" (dG_f = -237.13 kJ/mol; S: 69.95, 130.68, 205.15 J/(mol K)).
  function eRev(T) {
    return 1.2288 - 0.000846 * (T - 298.15); // volts
  }

  // Thermoneutral voltage (HHV basis), V. At this voltage the electrical work also
  // supplies the heat (T dS) the reaction absorbs. dH / (nF) = 285.83 kJ/mol / (2F).
  // Source: CRC Handbook, dH_f of H2O(l) = -285.83 kJ/mol. Used only as a reference line.
  var E_TN = 1.481;

  // Charge-transfer coefficient alpha. 0.5 is the standard assumption for a
  // single-electron rate-determining step with a symmetric energy barrier.
  // Source: Bard & Faulkner, Electrochemical Methods, 2nd ed. (2001), Sec. 3.3.
  // Graphite has no well-defined literature value for these reactions, so this is
  // an ASSUMPTION, not a measured property. It fixes the Tafel slope:
  //   b = ln(10) R T / (alpha F) = 116 mV/decade at 20 C.
  var ALPHA = 0.5;

  // Limiting (infinite-dilution) molar ionic conductivities at 25 C, S cm^2/mol.
  // Source: CRC Handbook, "Equivalent Conductivity of Electrolytes in Aqueous
  // Solution" / "Ionic Conductivity and Diffusion at Infinite Dilution":
  //   lambda(Na+) = 50.08, lambda(HCO3-) = 44.5.
  var LAMBDA0_25 = 50.08 + 44.5; // = 94.58 S cm^2/mol for NaHCO3 at 25 C

  // Onsager limiting-law coefficients for a 1:1 electrolyte in water at 25 C.
  // Lambda drops with sqrt(c) because ions slow each other down (relaxation term,
  // B * Lambda0) and the solvent dragged by the counter-ions slows them (electrophoretic
  // term, A). Source: Robinson & Stokes, Electrolyte Solutions, 2nd ed. (1959), Ch. 7.
  var ONSAGER_A = 60.20;  // S cm^2 mol^-1 (mol/L)^-1/2
  var ONSAGER_B = 0.2289; // (mol/L)^-1/2

  // Ionic conductivities rise about 2% per K in water (mostly because viscosity
  // drops). We use this to move the 25 C values down to 20 C.
  // Source: CRC Handbook intro to the ionic-conductivity table (typical 2%/K).
  var COND_TEMP_COEF = 0.02;

  // Electrode geometry that was not varied: graphite rods, 6 mm diameter
  // (measured by Johnson).
  var ROD_D_MM = 6;

  /* ------------------------------------------------------------------ */
  /* 2. Fitted parameters (NOT from literature)                          */
  /* ------------------------------------------------------------------ */
  // These two values are FITTED to the 18 measured (voltage, current) trials by
  // least squares (see fit() below). They are placeholders until fit() runs;
  // the page and test.html always call fit() on the real CSV before using them.
  //   j0:   lumped exchange current density for the two graphite electrodes, A/cm^2.
  //   cEff: effective NaHCO3 concentration, mol/L. The real concentration was not
  //         recorded, so the fit finds the concentration whose conductivity matches
  //         the measured resistance. It also absorbs anything else that changed the
  //         resistance (rods inside collection tubes, submerged clips, rough spacing).
  var fitted = { j0: 1e-10, cEff: 0.15, fitted: false };

  /* ------------------------------------------------------------------ */
  /* 3. Default experimental conditions                                   */
  /* ------------------------------------------------------------------ */
  // Spacing: about 1.5 in center to center (Johnson's estimate) = 38.1 mm.
  // Immersed length: about 50 mm (Johnson's estimate; 500 mL in a 1000 mL beaker).
  // Area per electrode = curved side + flat bottom end of the rod.
  var DEFAULT_LEN_MM = 50;
  var DEFAULT_AREA_MM2 = Math.PI * ROD_D_MM * DEFAULT_LEN_MM + Math.PI * ROD_D_MM * ROD_D_MM / 4; // about 971 mm^2
  var defaults = {
    V: 5.5,               // volts; the voltage with the highest measured efficiency
    spacingMm: 38,        // mm, center to center (rounded from 38.1)
    areaMm2: Math.round(DEFAULT_AREA_MM2), // mm^2 per electrode
    tS: 60                // s, run time of every trial
  };

  /* ------------------------------------------------------------------ */
  /* 4. Building blocks                                                   */
  /* ------------------------------------------------------------------ */

  // Molar conductivity of NaHCO3 at concentration c (mol/L) and temperature T, S cm^2/mol.
  // Uses the extended Debye-Huckel-Onsager form Lambda = Lambda0 - S sqrt(c) / (1 + sqrt(c)).
  // The (1 + sqrt c) denominator accounts for the finite size of ions and keeps the
  // formula usable up to about 1 mol/L (for NaCl it is within about 2% at 0.1 M and 4% at 0.5 M
  // of the CRC table values). Bicarbonate/carbonate equilibria are ignored: at the
  // pH of a NaHCO3 solution (about 8.3) almost all the carbon is HCO3-.
  function molarConductivity(c, T) {
    var tempFactor = 1 + COND_TEMP_COEF * (T - 298.15);  // 0.90 at 20 C
    var L0 = LAMBDA0_25 * tempFactor;                    // limiting value at T
    var S = (ONSAGER_A + ONSAGER_B * LAMBDA0_25) * tempFactor; // slope of the sqrt(c) drop at T
    var rc = Math.sqrt(c);                               // sqrt of concentration
    return L0 - S * rc / (1 + rc);                       // S cm^2/mol
  }

  // Electrolyte conductivity kappa, S/m, at concentration c (mol/L).
  function conductivity(c, T) {
    var LambdaScm2 = molarConductivity(c, T);  // S cm^2/mol
    var kappaScm = LambdaScm2 * c / 1000;      // S/cm (c/1000 converts mol/L to mol/cm^3)
    return kappaScm * 100;                     // S/m
  }

  // Immersed length of a rod, mm, for a given wetted area per electrode (mm^2).
  // Area = pi D L (side) + pi D^2 / 4 (bottom end); solve for L.
  function lengthFromArea(areaMm2) {
    return (areaMm2 - Math.PI * ROD_D_MM * ROD_D_MM / 4) / (Math.PI * ROD_D_MM);
  }

  // Ohmic resistance of the electrolyte between two parallel rods, ohms.
  // For two long parallel cylinders of diameter D, center spacing s, immersed length L,
  // in a large bath of conductivity kappa:  R = arccosh(s / D) / (pi kappa L).
  // This is the same geometry factor as the capacitance of a two-wire line
  // (Smythe, Static and Dynamic Electricity; any EM text), because current flow
  // in a resistor and field lines in a capacitor obey the same Laplace equation.
  function ohmicResistance(c, spacingMm, areaMm2, T) {
    var kappa = conductivity(c, T);                       // S/m
    var Lm = lengthFromArea(areaMm2) / 1000;              // m
    var geom = Math.acosh(spacingMm / ROD_D_MM);          // dimensionless; needs s > D
    return geom / (Math.PI * kappa * Lm);                 // ohms
  }

  // Activation overpotential of ONE electrode, V, at current density j (A/cm^2).
  // Butler-Volmer with alpha = 0.5 can be inverted exactly:
  //   j = 2 j0 sinh(alpha F eta / R T)   ->   eta = (R T / alpha F) asinh(j / (2 j0)).
  // At high j this becomes the Tafel equation eta = b log10(j / j0).
  // At j = 0 it gives eta = 0, so the curve stays smooth below onset (plain Tafel
  // would give a negative, meaningless value there).
  function overpotential(j, j0, T) {
    return (R_GAS * T / (ALPHA * F)) * Math.asinh(j / (2 * j0));
  }

  /* ------------------------------------------------------------------ */
  /* 5. The cell: solve the voltage balance for current                   */
  /* ------------------------------------------------------------------ */

  // Returns everything the page needs at one operating point.
  // p = { V, c, spacingMm, areaMm2, tS, j0 }  (missing fields fall back to defaults/fit)
  function solve(p) {
    var T = T_K;
    var V = p.V;                                             // applied voltage, V
    var c = p.c != null ? p.c : fitted.cEff;                 // mol/L
    var s = p.spacingMm != null ? p.spacingMm : defaults.spacingMm; // mm
    var A = p.areaMm2 != null ? p.areaMm2 : defaults.areaMm2;      // mm^2
    var t = p.tS != null ? p.tS : defaults.tS;               // s
    var j0 = p.j0 != null ? p.j0 : fitted.j0;                // A/cm^2
    var Er = eRev(T);                                        // V
    var R = ohmicResistance(c, s, A, T);                     // ohms
    var Acm2 = A / 100;                                      // electrode area, cm^2

    // Voltage the cell needs to pass current I. Both electrodes carry the same I
    // and have the same area and (lumped) j0, so their overpotentials are equal.
    function needed(I) {
      var etaEach = overpotential(I / Acm2, j0, T);
      return Er + 2 * etaEach + I * R;
    }

    var I = 0;
    if (V > Er) {
      // needed(I) rises with I, so there is exactly one I where needed(I) = V.
      // It lies between 0 (needed = Er < V) and (V - Er)/R (where the ohmic term
      // alone already uses up V, so needed >= V). Bisection halves that bracket
      // each step; 80 steps shrink it far below a nanoamp.
      var lo = 0, hi = (V - Er) / R;
      for (var k = 0; k < 80; k++) {
        var mid = 0.5 * (lo + hi);
        if (needed(mid) > V) hi = mid; else lo = mid;
      }
      I = 0.5 * (lo + hi);
    }
    // Below E_rev the cell cannot electrolyze water, so I = 0.

    var etaEach = overpotential(I / Acm2, j0, T);           // V, per electrode
    var ohmic = I * R;                                       // V lost in the electrolyte
    var rateMolS = I / (2 * F);                              // mol H2/s at 100% Faradaic efficiency (2 e- per H2)
    var rateMlS = rateMolS * VM_ML;                          // mL H2/s
    var volMl = rateMlS * t;                                 // mL H2 over one run
    // Electrical energy per gram of H2 = V x (charge per gram) = V x 2F / M_H2, in J/g.
    // 1 J/g = 1000 J/kg = 1000 / 3.6e6 kWh/kg.
    var kWhPerKg = V * 2 * F / M_H2 * 1000 / 3.6e6;

    return {
      V: V, I: I, T: T, c: c, spacingMm: s, areaMm2: A, tS: t, j0: j0,
      Erev: Er,                         // reversible voltage, V
      etaAnode: etaEach,                // V
      etaCathode: etaEach,              // V
      activation: 2 * etaEach,          // V, both electrodes together
      ohmic: ohmic,                     // V
      R: R,                             // ohms
      kappa: conductivity(c, T),        // S/m
      j: I / Acm2,                      // A/cm^2
      rateMlS: rateMlS,                 // mL/s at 100% FE
      volMl: volMl,                     // mL in tS at 100% FE
      voltEff: I > 0 ? Er / V : 0,      // fraction, Gibbs-energy basis
      voltEffHHV: I > 0 ? E_TN / V : 0, // fraction, enthalpy (HHV) basis
      kWhPerKg: kWhPerKg                // kWh per kg H2 at 100% FE (divide by FE otherwise)
    };
  }

  // Faraday's law on its own, so the tests can check the model against it:
  // volume (mL) = I t / (2F) x V_m.
  function faradayVolume(I, tS) {
    return I * tS / (2 * F) * VM_ML;
  }

  /* ------------------------------------------------------------------ */
  /* 6. Fitting the two uncertain parameters to the measured data         */
  /* ------------------------------------------------------------------ */

  // Minimizes f(x) over a 2-vector x with the Nelder-Mead simplex method
  // (no derivatives needed). Good enough for a smooth 2-parameter problem.
  function nelderMead(f, x0, step, iters) {
    var n = x0.length;
    var pts = [x0.slice()];                         // simplex: n + 1 points
    for (var i = 0; i < n; i++) { var p = x0.slice(); p[i] += step[i]; pts.push(p); }
    var vals = pts.map(f);
    for (var it = 0; it < iters; it++) {
      var order = vals.map(function (v, k) { return k; }).sort(function (a, b) { return vals[a] - vals[b]; });
      pts = order.map(function (k) { return pts[k]; }); vals = order.map(function (k) { return vals[k]; });
      var cen = new Array(n).fill(0);               // centroid of all but the worst point
      for (var a = 0; a < n; a++) for (var d = 0; d < n; d++) cen[d] += pts[a][d] / n;
      var worst = pts[n];
      var refl = cen.map(function (c, d) { return c + (c - worst[d]); });
      var fr = f(refl);
      if (fr < vals[0]) {                           // reflection is best so far: try going further
        var exp = cen.map(function (c, d) { return c + 2 * (c - worst[d]); });
        var fe = f(exp);
        if (fe < fr) { pts[n] = exp; vals[n] = fe; } else { pts[n] = refl; vals[n] = fr; }
      } else if (fr < vals[n - 1]) {                // reflection is ordinary: accept it
        pts[n] = refl; vals[n] = fr;
      } else {                                      // reflection failed: contract toward centroid
        var con = cen.map(function (c, d) { return c + 0.5 * (worst[d] - c); });
        var fc = f(con);
        if (fc < vals[n]) { pts[n] = con; vals[n] = fc; }
        else {                                      // still bad: shrink everything toward the best point
          for (var q = 1; q <= n; q++) { pts[q] = pts[q].map(function (v, d) { return pts[0][d] + 0.5 * (v - pts[0][d]); }); vals[q] = f(pts[q]); }
        }
      }
    }
    var best = 0; for (var b = 1; b <= n; b++) if (vals[b] < vals[best]) best = b;
    return { x: pts[best], f: vals[best] };
  }

  // trials: array of { V, I } (one per measured run, amps).
  // Fits log10(j0) and log10(cEff) by least squares on current, holding spacing
  // and area at the experimental defaults. Logs are used because both parameters
  // are positive and span orders of magnitude.
  function fit(trials, opts) {
    opts = opts || {};
    var s = opts.spacingMm || defaults.spacingMm, A = opts.areaMm2 || defaults.areaMm2;
    function residuals(x) {
      var j0 = Math.pow(10, x[0]), c = Math.pow(10, x[1]);
      return trials.map(function (t) { return solve({ V: t.V, c: c, spacingMm: s, areaMm2: A, j0: j0 }).I - t.I; });
    }
    function sse(x) { return residuals(x).reduce(function (a, r) { return a + r * r; }, 0); }

    var res = nelderMead(sse, [-10, -0.8], [1, 0.3], 400);
    var x = res.x;

    // Standard errors from the linearized least-squares covariance:
    // cov = s^2 (J^T J)^-1, with J the derivative of each residual w.r.t. each parameter.
    var r0 = residuals(x), h = 1e-4, J = [[], []];
    for (var d = 0; d < 2; d++) {
      var xp = x.slice(); xp[d] += h;
      var rp = residuals(xp);
      for (var i = 0; i < r0.length; i++) J[d][i] = (rp[i] - r0[i]) / h;
    }
    var a = 0, b = 0, cc = 0;
    for (i = 0; i < r0.length; i++) { a += J[0][i] * J[0][i]; b += J[0][i] * J[1][i]; cc += J[1][i] * J[1][i]; }
    var dof = r0.length - 2, s2 = res.f / dof, det = a * cc - b * b;
    var seLogJ0 = Math.sqrt(s2 * cc / det), seLogC = Math.sqrt(s2 * a / det);

    fitted = { j0: Math.pow(10, x[0]), cEff: Math.pow(10, x[1]), fitted: true,
      logJ0: x[0], logC: x[1], seLogJ0: seLogJ0, seLogC: seLogC,
      // log-space SE turned into a +/- on the value itself (first-order: dX = X ln10 dlogX)
      cEffSE: Math.pow(10, x[1]) * Math.LN10 * seLogC,
      rmsA: Math.sqrt(res.f / r0.length), n: r0.length };
    return fitted;
  }

  // Least-squares straight line, used for the "apparent onset" the site reports:
  // fit I = m V + b over the measured voltage range and extrapolate to I = 0.
  function linearOnset(points) {
    var n = points.length, mx = 0, my = 0, sxx = 0, sxy = 0;
    points.forEach(function (p) { mx += p.V; my += p.I; }); mx /= n; my /= n;
    points.forEach(function (p) { sxx += (p.V - mx) * (p.V - mx); sxy += (p.V - mx) * (p.I - my); });
    var m = sxy / sxx, b = my - m * mx;
    return { slope: m, intercept: b, onsetV: -b / m };
  }

  var api = {
    F: F, R_GAS: R_GAS, M_H2: M_H2, VM_ML: VM_ML, T_K: T_K, E_TN: E_TN, ALPHA: ALPHA, ROD_D_MM: ROD_D_MM,
    MARGINAL_FE: 0.90, // measured marginal Faradaic efficiency (slope 6.74 / 7.46 mL/A, Results section)
    defaults: defaults,
    eRev: eRev, molarConductivity: molarConductivity, conductivity: conductivity,
    lengthFromArea: lengthFromArea, ohmicResistance: ohmicResistance, overpotential: overpotential,
    solve: solve, faradayVolume: faradayVolume, fit: fit, linearOnset: linearOnset,
    tafelSlope: function () { return Math.LN10 * R_GAS * T_K / (ALPHA * F); }, // V/decade
    get fitted() { return fitted; }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.H2Model = api;
})(this);
