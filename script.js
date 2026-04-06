const defaultPhotos = [
  {
    src: 'assets/photos/setup-placeholder.svg',
    caption: 'Replace this with a full setup photo of the electrolysis apparatus.'
  },
  {
    src: 'assets/photos/electrodes-placeholder.svg',
    caption: 'Replace this with a close-up of the electrodes and wiring.'
  },
  {
    src: 'assets/photos/collection-placeholder.svg',
    caption: 'Replace this with the gas collection setup or graduated cylinder image.'
  }
];

const defaultGraphs = [
  {
    src: 'assets/graphs/graph-placeholder.svg',
    caption: 'Optional: upload screenshots of your Excel or Python-generated figures here.'
  }
];

function renderGallery(items, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (!items.length) {
    container.innerHTML = '<div class="empty-state">No images added yet.</div>';
    return;
  }

  items.forEach(item => {
    const card = document.createElement('article');
    card.className = 'gallery-item';
    card.innerHTML = `
      <img src="${item.src}" alt="${item.caption}">
      <div class="gallery-caption">${item.caption}</div>
    `;
    container.appendChild(card);
  });
}

function previewLocalImages(inputId, containerId, existingItems = []) {
  const input = document.getElementById(inputId);
  input.addEventListener('change', event => {
    const files = Array.from(event.target.files || []);
    const previewItems = files.map(file => ({
      src: URL.createObjectURL(file),
      caption: file.name
    }));
    renderGallery([...existingItems, ...previewItems], containerId);
  });
}

function loadCsv(file) {
  Papa.parse(file, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: results => {
      const rows = results.data.filter(row => Object.values(row).some(value => value !== null && value !== ''));
      renderTable(rows);
      renderCharts(rows);
    }
  });
}

function loadDefaultCsv() {
  Papa.parse('data/electrolysis_data.csv', {
    download: true,
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: results => {
      const rows = results.data.filter(row => Object.values(row).some(value => value !== null && value !== ''));
      renderTable(rows);
      renderCharts(rows);
    },
    error: () => {
      renderEmptyDataState();
    }
  });
}

function renderEmptyDataState() {
  const table = document.getElementById('dataTable');
  table.innerHTML = `
    <tr><td class="empty-state">No CSV data found yet. Add your dataset to <code>data/electrolysis_data.csv</code>.</td></tr>
  `;
}

function renderTable(rows) {
  const table = document.getElementById('dataTable');
  if (!rows.length) {
    renderEmptyDataState();
    return;
  }

  const headers = Object.keys(rows[0]);
  const thead = `
    <thead>
      <tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr>
    </thead>
  `;

  const tbody = `
    <tbody>
      ${rows.map(row => `
        <tr>
          ${headers.map(header => `<td>${row[header] ?? ''}</td>`).join('')}
        </tr>
      `).join('')}
    </tbody>
  `;

  table.innerHTML = thead + tbody;
}

function pick(rows, key) {
  return rows.map(row => Number(row[key])).filter(value => Number.isFinite(value));
}

function getSharedXY(rows, xKey, yKey) {
  return rows
    .map(row => ({ x: Number(row[xKey]), y: Number(row[yKey]) }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function renderCharts(rows) {
  const hv = getSharedXY(rows, 'Voltage (V)', 'Hydrogen Volume (mL)');
  const cv = getSharedXY(rows, 'Voltage (V)', 'Current (A)');
  const rate = rows
    .map(row => {
      const volume = Number(row['Hydrogen Volume (mL)']);
      const time = Number(row['Time (s)']);
      const voltage = Number(row['Voltage (V)']);
      return {
        x: voltage,
        y: (Number.isFinite(volume) && Number.isFinite(time) && time !== 0) ? volume / time : NaN
      };
    })
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));

  const layoutBase = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { t: 20, r: 10, b: 60, l: 60 },
    font: { family: 'Inter, sans-serif' }
  };

  Plotly.newPlot('chartHydrogenVoltage', [{
    x: hv.map(p => p.x),
    y: hv.map(p => p.y),
    mode: 'lines+markers',
    name: 'Hydrogen Volume'
  }], {
    ...layoutBase,
    xaxis: { title: 'Voltage (V)' },
    yaxis: { title: 'Hydrogen Volume (mL)' }
  }, { responsive: true, displaylogo: false });

  Plotly.newPlot('chartCurrentVoltage', [{
    x: cv.map(p => p.x),
    y: cv.map(p => p.y),
    mode: 'lines+markers',
    name: 'Current'
  }], {
    ...layoutBase,
    xaxis: { title: 'Voltage (V)' },
    yaxis: { title: 'Current (A)' }
  }, { responsive: true, displaylogo: false });

  Plotly.newPlot('chartRate', [{
    x: rate.map(p => p.x),
    y: rate.map(p => p.y),
    mode: 'lines+markers',
    name: 'Production Rate'
  }], {
    ...layoutBase,
    xaxis: { title: 'Voltage (V)' },
    yaxis: { title: 'Hydrogen Production Rate (mL/s)' }
  }, { responsive: true, displaylogo: false });
}

window.addEventListener('DOMContentLoaded', () => {
  renderGallery(defaultPhotos, 'photoGallery');
  renderGallery(defaultGraphs, 'graphGallery');
  previewLocalImages('photoUpload', 'photoGallery', defaultPhotos);
  previewLocalImages('graphUpload', 'graphGallery', defaultGraphs);

  const csvUpload = document.getElementById('csvUpload');
  csvUpload.addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (file) loadCsv(file);
  });

  loadDefaultCsv();
});
