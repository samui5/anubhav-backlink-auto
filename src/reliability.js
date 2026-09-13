// Idea #3 (reframed for what these sites actually are): most entries in
// config/sites.js are one-shot ping/backlink-maker tools, not directory
// listings, so there's no separate page to revisit later and confirm "the
// link is still there." What IS meaningful is tracking each site's success
// rate across runs over time and flagging one that's quietly gone bad
// (started CAPTCHA-walling automated traffic, redirecting to a login page,
// etc.) — the kind of drift a single run's report can't distinguish from
// ordinary noise.
const fs = require('fs');
const path = require('path');

const MAX_HISTORY_PER_SITE = 20;
const MIN_ATTEMPTS_TO_FLAG = 4;
const FLAG_RATE_THRESHOLD = 0.5;

function loadLedger(ledgerPath) {
  try {
    return JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  } catch {
    return {};
  }
}

function saveLedger(ledgerPath, ledger) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), 'utf8');
}

// Merges this run's per-attempt results into the persisted ledger (capped
// to the most recent MAX_HISTORY_PER_SITE attempts per site, across all
// browsers combined), then returns a rolling summary sorted worst-first and
// the subset of sites whose rolling success rate has dropped below
// FLAG_RATE_THRESHOLD with enough data to be meaningful (MIN_ATTEMPTS_TO_FLAG).
function updateReliability(ledgerPath, results, runTimestamp) {
  const ledger = loadLedger(ledgerPath);

  for (const r of results) {
    const history = ledger[r.site] || [];
    history.push({ t: runTimestamp, status: r.status, browser: r.browser });
    ledger[r.site] = history.length > MAX_HISTORY_PER_SITE ? history.slice(-MAX_HISTORY_PER_SITE) : history;
  }
  saveLedger(ledgerPath, ledger);

  const summary = Object.entries(ledger).map(([site, history]) => {
    const attempts = history.length;
    const submitted = history.filter((h) => h.status === 'submitted').length;
    return { site, attempts, submitted, rate: attempts ? submitted / attempts : 0 };
  });
  summary.sort((a, b) => a.rate - b.rate);

  const flagged = summary.filter((s) => s.attempts >= MIN_ATTEMPTS_TO_FLAG && s.rate < FLAG_RATE_THRESHOLD);

  return { summary, flagged };
}

module.exports = { updateReliability, loadLedger };
