/** CSV export. Quotes per RFC 4180; objects are JSON-encoded. */

export function toCsv(rows, columns) {
  const cell = (v) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(',')].concat(rows.map((r) => columns.map((c) => cell(r[c])).join(','))).join('\n');
}

export function downloadCsv(rows, columns, filename) {
  const url = URL.createObjectURL(new Blob([toCsv(rows, columns)], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
