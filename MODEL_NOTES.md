# Model notes

These notes explain the model in the "Model" section of the site: what each equation is, where every number comes from, which values were fitted to my data, and where the model stops being right. The code is in `model.js` (math only) and `model-ui.js` (sliders and charts). The checks are in `test.html`.

## 1. What the model does

It predicts the steady-state current through my two-electrode cell for any applied voltage, NaHCO₃ concentration, electrode spacing, and electrode area. From the current it gets the hydrogen production rate (Faraday's law), the voltage efficiency, and the electrical energy per kilogram of H₂.

It is a deliberately ideal model of the two graphite rods in the electrolyte. It leaves out the collection tubes, the submerged alligator clips, gas lost from collection, and H₂ that dissolves or sticks to the electrode. Those effects show up as the gaps between the model and my data.

## 2. The voltage balance

All the applied voltage is used up by four things in series:

```
V = E_rev + η_a + η_c + I · R_Ω
```

| Term | Meaning | Value at 5.5 V |
|---|---|---|
| E_rev | Thermodynamic minimum to split water | 1.233 V |
| η_a | Extra voltage the anode reaction (O₂ evolution) needs to run at current I | 0.987 V |
| η_c | Extra voltage the cathode reaction (H₂ evolution) needs to run at current I | 0.987 V |
| I · R_Ω | Voltage lost pushing ions through the electrolyte | 2.294 V |
| Sum | | 5.500 V |

The current I appears inside η_a, η_c, and I·R_Ω, so the equation can't be rearranged into "I = ...". The model solves it numerically (Section 7).

## 3. Each term

### 3.1 Reversible voltage, E_rev

```
E_rev(T) = ΔG° / (nF) + (ΔS° / nF)(T − 298.15 K)
         = 1.2288 V − 0.000846 V/K × (T − 298.15 K)
```

- ΔG° = 237.13 kJ/mol for H₂O(l) → H₂ + ½O₂, and n = 2 electrons per H₂.
- ΔS° = 130.68 + ½(205.15) − 69.95 = 163.3 J/(mol·K). The reaction makes gas from liquid, so entropy goes up, and E_rev drops slightly as temperature rises.
- At the assumed 20 °C, E_rev = 1.233 V.
- Source: CRC Handbook of Chemistry and Physics, standard thermodynamic properties table.

The thermoneutral voltage, 1.481 V (ΔH°/2F with ΔH° = 285.83 kJ/mol), is mentioned for reference only. It is the voltage at which the cell neither heats up nor cools down.

### 3.2 Activation overpotentials, η_a and η_c (Butler–Volmer)

Electrode reactions need an extra push to run at a useful rate. The Butler–Volmer equation links current density j (A/cm²) to overpotential η:

```
j = j0 [exp(αFη/RT) − exp(−(1−α)Fη/RT)]
```

- j0 is the exchange current density, a measure of how fast the reaction is at equilibrium.
- α is the charge-transfer coefficient.

With α = 0.5, the two exponentials combine into a sinh, and the equation can be inverted exactly:

```
j = 2 j0 sinh(αFη/RT)    →    η = (RT/αF) · asinh(j / 2j0)
```

- At large j, asinh(x) ≈ ln(2x), so this becomes the Tafel equation, η = b·log₁₀(j/j0).
- The Tafel slope is b = ln(10)·RT/(αF) = 116 mV per decade at 20 °C. Every 10× increase in current density costs another 116 mV per electrode.
- At j = 0, η = 0. Plain Tafel would give a negative value near zero current, which means nothing physically; the asinh form avoids that, so the curve stays smooth below onset.
- j = I / A, where A is the wetted area of one rod. Both rods carry the same current and have the same area, so the model gives them the same j.

**Why only one j0 is fitted.** At high current, with the same Tafel slope on both electrodes:

```
η_a + η_c = b log(j/j0,a) + b log(j/j0,c) = 2b · log( j / √(j0,a · j0,c) )
```

The total depends only on the geometric mean of the two exchange current densities. My current–voltage data measures the total, not the two electrodes separately. So the anode and cathode values can't be separated, and the model fits one lumped j0 used for both.

### 3.3 Ohmic loss, I·R_Ω

The electrolyte resists ion flow. For two long parallel cylinders (diameter D, center-to-center spacing s, immersed length L) in a large bath of conductivity κ:

```
R_Ω = arccosh(s / D) / (π κ L)
```

- This is the same geometry factor as the capacitance of a two-wire transmission line. Current flow in a resistor and electric field lines in a capacitor both obey Laplace's equation, so they share the same solution.
- My numbers: D = 6 mm, s = 38 mm, L = 50 mm. That gives arccosh(6.33) = 2.53, so R_Ω = 2.53 / (π κ L).
- Area and length are linked by A = πDL + πD²/4 (curved side plus the flat bottom). For L = 50 mm, A = 971 mm². The area slider changes L at a fixed 6 mm diameter.
- Spacing enters only through a logarithm (arccosh(x) ≈ ln(2x) for large x). Moving the rods from 38 mm apart to 19 mm apart lowers R by only about 28%, not 50%. This is different from parallel plates, where R ∝ spacing. Rods behave this way because most of the resistance is in the crowded region right around each rod.

### 3.4 Conductivity of NaHCO₃, κ(c)

Molar conductivity Λ (S·cm²/mol) falls as concentration rises, because ions slow each other down. The model uses an extended Debye–Hückel–Onsager equation:

```
Λ(c) = Λ° − S · √c / (1 + √c)
S = A + B · Λ°
κ (S/cm) = Λ · c / 1000      (c in mol/L)
```

- **Limiting conductivity:** Λ° = λ°(Na⁺) + λ°(HCO₃⁻) = 50.08 + 44.5 = 94.58 S·cm²/mol at 25 °C. Source: CRC Handbook, ionic conductivities at infinite dilution.
- **Onsager coefficients:** A = 60.20 and B = 0.2289, the 1:1-electrolyte values in water at 25 °C. Source: Robinson & Stokes, *Electrolyte Solutions*, 2nd ed. (1959).
- **Why the (1 + √c) denominator:** it accounts for the finite size of ions. Without it, the plain Onsager limiting law badly underpredicts Λ above about 0.01 M. As a check, the same formula for NaCl gives Λ within about 2% of CRC table values at 0.1 M and about 4% at 0.5 M.
- **Temperature:** both Λ° and S are scaled by (1 + 0.02/K × (T − 298.15 K)), the typical 2%-per-kelvin rise in ionic conductivity. At 20 °C this is a factor of 0.90.
- **Equilibria ignored:** at the pH of NaHCO₃ solution (about 8.3), nearly all dissolved carbon is HCO₃⁻, so CO₃²⁻ and CO₂ are left out.

At the fitted 0.151 mol/L, κ = 9.7 mS/cm, and R_Ω = 16.5 Ω.

## 4. Outputs

| Output | Equation | Value at 5.5 V |
|---|---|---|
| Current | solve the voltage balance | 0.139 A |
| H₂ rate | I / (2F) × V_m, with V_m = 24.0 L/mol | 1.03 mL/min |
| H₂ in 60 s | rate × 60 s | 1.03 mL |
| Voltage efficiency | E_rev / V | 22.4% |
| Energy per kg H₂ | V · 2F / M_H₂, converted to kWh/kg | 146 kWh/kg (162 at 90%) |

- **Faraday's law:** each H₂ needs 2 electrons, so mol H₂/s = I / (2F).
- **Faradaic efficiency:** the main model line assumes every electron makes H₂ (100%). The second line multiplies by 0.90, my measured marginal Faradaic efficiency: the slope of H₂ volume vs. current, 6.74 mL/A, divided by Faraday's 7.46 mL/A.
- **Energy:** energy per gram is V × (charge per gram) = V × 2F / M_H₂. That works out to 26.6 kWh/kg per volt of applied voltage. For comparison, the higher heating value of H₂ is 39.4 kWh/kg, so at 5.5 V and 100% Faradaic efficiency the cell turns about 27% of the electrical energy into H₂ energy.
- **V_m:** 24.0 L/mol matches the Theory section, so the model and the rest of the site use identical numbers. The exact ideal-gas value at 20 °C and 1 atm is 24.05 L/mol.

## 5. Parameters: literature vs. fitted

| Parameter | Value | Source |
|---|---|---|
| F | 96,485.33 C/mol | CODATA 2018 (exact) |
| R | 8.3145 J/(mol·K) | CODATA 2018 (exact) |
| M_H₂ | 2.016 g/mol | IUPAC atomic weights |
| E_rev at 20 °C | 1.233 V | CRC thermodynamic data |
| α | 0.5 | Standard assumption (Bard & Faulkner, *Electrochemical Methods*, 2001); not measured for graphite here |
| Λ°(Na⁺), Λ°(HCO₃⁻) | 50.08, 44.5 S·cm²/mol | CRC Handbook |
| Onsager A, B | 60.20, 0.2289 | Robinson & Stokes (1959) |
| Rod diameter | 6 mm | Measured (my setup) |
| Spacing | 38 mm | My estimate (about 1.5 in, center to center) |
| Immersed length | 50 mm | My estimate (500 mL in a 1000 mL beaker) |
| Temperature | 20 °C | Assumed, not measured |
| **NaHCO₃ concentration** | **0.151 ± 0.007 mol/L** | **Fitted** (the real concentration was not recorded) |
| **j0 (lumped)** | **4.8 × 10⁻¹¹ A/cm²**, within a factor of about 2.6 | **Fitted** |

### How the fit works

- Both fitted parameters are found by least squares: minimize Σ (I_model − I_measured)² over all 18 trials, with spacing and area fixed at the experimental values.
- The fit works on log₁₀(j0) and log₁₀(c), because both are positive and could span orders of magnitude. The minimizer is the Nelder–Mead simplex method.
- Standard errors come from the linearized covariance, s²(JᵀJ)⁻¹. J is the matrix of derivatives of each residual with respect to each parameter, and s² is the residual variance with 16 degrees of freedom.
- The fit runs in the browser every time the page loads, on the same CSV the charts use. If the data change, the fitted values update automatically.

### Why these two

- **Concentration.** I don't remember the concentration. It sets κ, so it controls the slope of the I–V line (about 17 Ω).
- **j0.** Graphite exchange current densities for these reactions aren't well defined, and depend on the surface, pH, and pretreatment. j0 controls where the line sits, which sets the apparent onset near 3.1 V.

Two features of the data (slope and offset) pin down two parameters, so the fit is well determined.

### How to read the fitted values

- **The concentration is an effective value.** It is "the NaHCO₃ concentration that would give this resistance if the cell were two bare rods in an open bath." The real cell had each rod inside a collection tube, so ions had to leave through the tube mouth; that adds resistance, which pushes the fitted value down. The submerged clips added a parallel current path, which lowers resistance and pushes it up.
- **It depends on my geometry estimates.** R_Ω ∝ 1/(κL). If the rods were really 40 mm deep instead of 50 mm, the fit would need κ about 25% higher, roughly 0.19 mol/L. The ± 0.007 mol/L covers only scatter in the data, not this geometry uncertainty.
- **j0 is a lumped kinetic number for this cell, not a property of graphite.** It is very small, meaning the reactions are slow on bare graphite. It also absorbs the anode side, where graphite in bicarbonate can oxidize (corrode) alongside O₂ evolution. It is uncertain by a factor of about 2.6, because current depends on log(j0), so a large change in j0 only shifts the curve slightly.

## 6. Assumptions

1. **Steady state.** Current is constant during a run; no charging of the electrode double layer, no drift.
2. **Uniform temperature of 20 °C.** Joule heating (about 1.3 W at 6.5 V) is ignored.
3. **Electrodes and electrolyte:**
   - Both electrodes are bare graphite rods with identical area and kinetics.
   - Current density is uniform over each rod.
   - Bubbles don't cover the surface or block the electrolyte.
4. **Kinetics:** the same symmetric Butler–Volmer kinetics (α = 0.5) at both electrodes, with no mass-transport limit. The current densities here (about 15 mA/cm²) are well below where diffusion would limit water splitting.
5. **Electrolyte:**
   - Two infinitely long parallel rods in an unbounded bath; beaker walls, the rod ends, and the tubes are ignored.
   - The electrolyte composition doesn't change during a run. In reality, the cathode makes OH⁻ and the anode makes H⁺, which shifts the local pH.
6. **Gas:**
   - All current makes H₂ at the cathode (100% Faradaic) for the main line.
   - The gas is ideal at 24.0 L/mol.

## 7. Solving for current

- **The function being solved:** g(I) = E_rev + 2η(I/A) + I·R_Ω. It always increases with I, because η and I·R_Ω both grow with I. So there is exactly one current where g(I) = V.
- **Bisection:**
  1. Start with the bracket [0, (V − E_rev)/R_Ω]. At I = 0, g = E_rev < V. At the upper end, the ohmic term alone uses all of V − E_rev, so g ≥ V. The answer must lie in between.
  2. Evaluate g at the midpoint. If it is above V, the answer is in the lower half; otherwise it is in the upper half.
  3. Repeat 80 times. The bracket shrinks by 2⁸⁰, far below any meaningful current.
- **Why bisection:** it is slower than Newton's method but can't fail or diverge, which matters when a user drags sliders to extreme values.
- **Below E_rev:** the model returns I = 0. Water can't be split below the thermodynamic minimum. A negative current would mean the cell running as a fuel cell, which needs stored H₂ and O₂ that this cell doesn't have.

## 8. How well it matches (test.html)

| Check | Result |
|---|---|
| Modeled current within 10% of the measured mean at each voltage | Pass. Largest gap +4.3% at 5.5 V; RMS error 7.8 mA over 18 trials |
| Onset near 3.1 V (linear fit from 4.0 to 6.5 V, extended to zero current) | Pass. Model 3.08 V, measured 3.07 V |
| H₂ volume equals Faraday's law applied to the modeled current | Pass. Differences at the 10⁻¹⁶ level |
| Raising concentration lowers I·R_Ω and raises current | Pass at 5.5 V for 0.05 to 1.0 mol/L |

A few notes on these checks:

- **The 10% tolerance.** It is about twice the replicate spread at each voltage. That spread comes mostly from the hand-set spacing, which varied from run to run.
- **The onset.** The model's current curve actually bends at low voltage and first reaches 1 mA at about 2.7 V. "3.1 V" is an extrapolated number, and the model reproduces it the same way the Results section computes it.
- **The Faraday check guards the code, not the physics.** The model computes volume with the same formula, so this check catches future editing mistakes rather than testing the science.
- **The concentration check.** At fixed V, I·R_Ω = V − E_rev − 2η(I). Raising concentration raises I, which raises η, so I·R_Ω must fall even though I goes up.

## 9. Known limitations

1. **The measured H₂ is lower than the model at every voltage.** The model has no term for the fixed loss per run (the −0.073 mL intercept in Results: dissolved H₂ and bubbles stuck to the electrode) or for gas escaping the tubes above 5.5 V. These are collection losses, not electrochemistry, so the model leaves them out on purpose.
2. **Kinetic parameters are not separable.** Only the lumped j0 is determined, and only for an assumed α = 0.5. A different α would change both the Tafel slope and the fitted j0. Because the measured curve is nearly straight from 4 to 6.5 V, the data do not constrain α well, so 0.5 is an assumption rather than a result.
3. **The concentration is effective, not measured.** See Section 5.
4. **Rod geometry is idealized.** The arccosh formula assumes infinitely long rods far from walls. Real rods were tilted, in tubes, with clips in the solution.
5. **No side reactions at the anode.** Graphite oxidation to CO₂, and CO₂ from bicarbonate, would use current without making O₂. They don't change the H₂ prediction at the cathode, but they mean anode kinetics are not pure O₂ evolution.
6. **Slider ranges go beyond the data.** The model is fitted only at 38 mm, 971 mm², and 4.0 to 6.5 V. Predictions at very different settings (for example 1 mol/L, where conductivity would be about 48 mS/cm) rest on the conductivity formula and the geometry formula without data to check them.
7. **No heating, pH change, or bubble effects at high current.** These would make the real I–V curve bend away from the model at large currents.

## 10. Talking points

- **Where the voltage goes.** "At 5.5 V only 1.23 V does thermodynamic work. About 2 V goes to activation losses on bare graphite and about 2.3 V to ohmic loss in a dilute electrolyte. That's why the voltage efficiency is only 22%, and why commercial alkaline cells use concentrated KOH and nickel electrodes, which attack exactly those two losses."
- **Why the I–V curve looks linear.** "Above about 4 V the ohmic term dominates and grows linearly with I, while the activation term grows only with log I. So the curve looks like a straight line with slope 1/R, and extrapolating that line gives the apparent 3.1 V onset, not the true onset."
- **Honest about fitting.** "I didn't record the concentration, so I fitted it. I treat it as an effective value because it also absorbs geometry I didn't model, and I report which parameters are fitted and which come from literature."
- **Why one lumped j0.** "With equal Tafel slopes, only the geometric mean of the anode and cathode exchange current densities is identifiable from total-cell data. To separate them I'd need a reference electrode."

## Files

- `model.js`: constants, equations, solver, fit. No page code.
- `model-ui.js`: sliders, readouts, and the three charts. Reuses the chart frame from `script.js`.
- `test.html`: the four checks with pass/fail. Open it through a local server (`python -m http.server`), the same as the main page.
