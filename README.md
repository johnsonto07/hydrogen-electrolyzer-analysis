# Hydrogen Electrolysis

Project site: https://hydrogen.johnsonto.com/

A benchtop water electrolysis cell with graphite electrodes and a baking soda electrolyte. 18 timed trials from 4.0 to 6.5 V, hydrogen measured by water displacement and compared against Faraday's law. Peak Faradaic efficiency was 88% at 5.5 V.

## Files

- `index.html`, `styles.css`, `script.js`: the one-page site. The charts and tables are drawn in the browser from `data/electrolysis_data.csv`, so editing that file updates the page.
- `data/electrolysis_data.csv`: raw measurements, one row per trial.
- `model.js`, `model-ui.js`: the interactive cell model in the Model section (math in `model.js`, sliders and charts in `model-ui.js`). Two parameters are fitted to the CSV on page load. See `MODEL_NOTES.md`.
- `test.html`: model checks with pass/fail, run in the browser.
- `analysis.py`: pandas/matplotlib analysis. Writes the processed CSVs in `data/` and the static figures in `assets/graphs/`.
- `fonts/`: Archivo variable font (SIL Open Font License, see `fonts/OFL.txt`).

## Preview locally

The page loads the CSV with `fetch`, so open it through a local server rather than as a file:

```bash
python -m http.server
```
