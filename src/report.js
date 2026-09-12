const fs = require('fs');

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const STATUS_COLORS = {
  success: '#1a7f37',
  submitted: '#1a7f37',
  failed: '#c1121f',
  'skipped-captcha': '#b8860b',
  'skipped-protected': '#b8860b',
};

function statusColor(status) {
  return STATUS_COLORS[status] || '#555';
}

function writeHtmlReport(htmlPath, summary, results) {
  const rows = results
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.browser)}</td>
        <td>${escapeHtml(r.site)}</td>
        <td><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.url)}</a></td>
        <td>${r.target ? `<a href="${escapeHtml(r.target)}" target="_blank" rel="noopener">${escapeHtml(r.target)}</a>` : ''}</td>
        <td>${escapeHtml(r.keyword || '')}</td>
        <td style="color:${statusColor(r.status)};font-weight:600">${escapeHtml(r.status)}</td>
        <td>${escapeHtml(r.message || '')}</td>
        <td>${r.durationMs != null ? Math.round(r.durationMs / 100) / 10 + 's' : ''}</td>
      </tr>`
    )
    .join('');

  const statusRows = Object.entries(summary.byStatus)
    .map(([status, count]) => `<li><span style="color:${statusColor(status)};font-weight:600">${escapeHtml(status)}</span>: ${count}</li>`)
    .join('');

  const browserRows = Object.entries(summary.byBrowser)
    .map(([browser, stats]) => {
      const parts = Object.entries(stats)
        .filter(([k]) => k !== 'total')
        .map(([status, count]) => `${escapeHtml(status)}: ${count}`)
        .join(', ');
      return `<li><strong>${escapeHtml(browser)}</strong> — ${stats.total} attempted (${parts})</li>`;
    })
    .join('');

  const targetUrlRows = summary.targetUrls
    .map((url) => `<li><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></li>`)
    .join('');

  const targetBreakdownRows = Object.entries(summary.byTarget)
    .map(([url, count]) => `<li><a href="${escapeHtml(url)}">${escapeHtml(url)}</a> — ${count}</li>`)
    .join('');

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Backlink automation report</title>
<style>
  body { font-family: -apple-system, Segoe UI, Arial, sans-serif; margin: 24px; color: #1c1c1c; background: #fafafa; }
  h1 { font-size: 20px; }
  h2 { font-size: 16px; margin-top: 28px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; background: #fff; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; }
  ul { padding-left: 20px; }
  .meta { color: #555; font-size: 13px; }
</style>
</head>
<body>
  <h1>Backlink / ping automation report</h1>
  <p class="meta">
    Started: ${escapeHtml(summary.startedAt)}<br>
    Finished: ${escapeHtml(summary.finishedAt)}<br>
    Total attempts: ${summary.totalAttempts}
  </p>

  <h2>Target links (random one picked per attempt)</h2>
  <ul>${targetUrlRows}</ul>

  <h2>Summary by status</h2>
  <ul>${statusRows}</ul>

  <h2>Summary by browser</h2>
  <ul>${browserRows}</ul>

  <h2>Summary by target link</h2>
  <ul>${targetBreakdownRows}</ul>

  <h2>Full log</h2>
  <table>
    <thead>
      <tr><th>Browser</th><th>Site</th><th>URL</th><th>Target</th><th>Keyword</th><th>Status</th><th>Message</th><th>Duration</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html, 'utf8');
}

module.exports = { writeHtmlReport };
