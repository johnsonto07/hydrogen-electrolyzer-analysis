async function loadCsv(path) {
  const response = await fetch(path);
  const text = await response.text();
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',');

  return lines.slice(1).map(line => {
    const values = line.split(',');
    const row = {};
    headers.forEach((header, i) => {
      row[header] = values[i] ?? '';
    });
    return row;
  });
}

function formatValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return value;

  // 3 significant figures formatting
  return Number(num.toPrecision(3)).toString();
}

function renderTable(rows, tableId) {
  const table = document.getElementById(tableId);

  if (!rows.length) {
    table.innerHTML = '<tr><td>No data found.</td></tr>';
    return;
  }

  const headers = Object.keys(rows[0]);

  const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(row => `
    <tr>${headers.map(h => `<td>${formatValue(row[h])}</td>`).join('')}</tr>
  `).join('')}</tbody>`;

  table.innerHTML = thead + tbody;
}

window.addEventListener('DOMContentLoaded', async () => {
  const summary = await loadCsv('data/electrolysis_summary_by_voltage.csv');
  const raw = await loadCsv('data/electrolysis_data_processed.csv');
  renderTable(summary, 'summaryTable');
  renderTable(raw, 'rawTable');
});
