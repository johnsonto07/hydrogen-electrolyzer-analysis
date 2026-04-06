# Hydrogen Electrolysis Project Website

This is a one-page static website for presenting a water electrolysis project.
It is designed to work well on GitHub Pages.

## Files

- `index.html` — page structure
- `styles.css` — layout and styling
- `script.js` — gallery logic, CSV parsing, and chart generation
- `data/electrolysis_data.csv` — raw dataset used for the table and interactive charts
- `assets/photos/` — place permanent project photos here
- `assets/graphs/` — place permanent graph images here

## How to update the site

### Add your own photos
1. Put your image files inside `assets/photos/`
2. Open `script.js`
3. Replace the placeholder items in `defaultPhotos` with your image file names and captions

Example:
```js
const defaultPhotos = [
  { src: 'assets/photos/setup.jpg', caption: 'Full electrolysis setup on the bench.' },
  { src: 'assets/photos/electrodes.jpg', caption: 'Close-up of electrodes during gas evolution.' }
];
```

### Add graph screenshots
1. Put your graph images inside `assets/graphs/`
2. Open `script.js`
3. Replace the placeholder item in `defaultGraphs`

### Update raw data
1. Open `data/electrolysis_data.csv`
2. Replace the sample rows with your actual data
3. Keep the same header names if you want the charts to keep working automatically

Required chart headers:
- `Voltage (V)`
- `Current (A)`
- `Time (s)`
- `Hydrogen Volume (mL)`

## Local preview
You can open `index.html` directly in a browser, but if a browser blocks the CSV fetch, use a simple local server.

Example with Python:
```bash
python -m http.server
```
Then open the local address shown in the terminal.

## GitHub Pages
1. Create a GitHub repository
2. Upload all files in this folder
3. Go to **Settings → Pages**
4. Set the source to deploy from the main branch
5. Save and open the published link
