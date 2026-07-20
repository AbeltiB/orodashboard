// src/lib/export.ts
// Client-side CSV/PDF-ready-HTML export — no extra deps. CSV opens fine in
// Excel directly; "PDF" is a print-ready HTML doc opened in a new tab with
// window.print() fired automatically, so the browser's own "Save as PDF"
// covers PDF and Print with the same code path. Shared by every dashboard
// page that offers CSV/PDF export (sales, reports, OTA mirrors).

export function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename + ".csv"; a.click();
  URL.revokeObjectURL(url);
}

export function exportHTML(filename: string, title: string, subtitle: string, headers: string[], rows: (string | number)[][]) {
  const rowsHtml = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
      h1 { font-size: 20px; margin-bottom: 4px; }
      p.meta { font-size: 12px; color: #64748b; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th { background: #1d4ed8; color: #fff; padding: 8px 10px; text-align: left; font-weight: 600; white-space: nowrap; }
      td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
      tr:nth-child(even) td { background: #f8fafc; }
      @media print { body { padding: 16px; } }
    </style>
  </head><body>
    <h1>${title}</h1>
    <p class="meta">OroDashboard · Generated ${new Date().toLocaleString("en-GB")} · ${subtitle}</p>
    <table>
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (w) setTimeout(() => w.print(), 600);
}
