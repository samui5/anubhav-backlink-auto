const fs = require('fs');
const path = require('path');

class RunLogger {
  constructor(settings) {
    this.settings = settings;
    this.startedAt = new Date();
    this.results = [];
    if (!fs.existsSync(settings.logsDir)) {
      fs.mkdirSync(settings.logsDir, { recursive: true });
    }
    const stamp = this.startedAt.toISOString().replace(/[:.]/g, '-');
    this.jsonPath = path.join(settings.logsDir, `run-${stamp}.json`);
    this.htmlPath = path.join(settings.logsDir, `run-${stamp}.html`);
  }

  record(entry) {
    this.results.push(entry);
    const tag = `[${entry.browser}] ${entry.site}`;
    console.log(`${tag} -> ${entry.status}${entry.message ? ' (' + entry.message + ')' : ''}`);
  }

  summary() {
    const byStatus = {};
    for (const r of this.results) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    }
    const byBrowser = {};
    for (const r of this.results) {
      byBrowser[r.browser] = byBrowser[r.browser] || { total: 0 };
      byBrowser[r.browser].total += 1;
      byBrowser[r.browser][r.status] = (byBrowser[r.browser][r.status] || 0) + 1;
    }
    const byTarget = {};
    for (const r of this.results) {
      if (!r.target) continue;
      byTarget[r.target] = (byTarget[r.target] || 0) + 1;
    }
    return {
      startedAt: this.startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      targetUrls: this.settings.targetUrls,
      totalAttempts: this.results.length,
      byStatus,
      byBrowser,
      byTarget,
    };
  }

  writeJson() {
    const payload = { summary: this.summary(), results: this.results };
    fs.writeFileSync(this.jsonPath, JSON.stringify(payload, null, 2), 'utf8');
    return this.jsonPath;
  }
}

module.exports = { RunLogger };
