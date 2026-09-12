const { settings, pickKeyword, pickTargetUrl } = require('./config/settings');
const allSites = require('./config/sites');
const { runBrowserWorker } = require('./src/worker');
const { RunLogger } = require('./src/logger');
const { writeHtmlReport } = require('./src/report');
const { sendReportEmail } = require('./src/mailer');

function parseArgs(argv) {
  const opts = { only: null, limit: null, headless: null };
  for (const arg of argv) {
    if (arg.startsWith('--only=')) opts.only = arg.slice('--only='.length).split(',');
    else if (arg.startsWith('--limit=')) opts.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--headless') opts.headless = true;
  }
  return opts;
}

function normalizeForDedupe(url) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function dedupeSites(sites) {
  const seen = new Set();
  const unique = [];
  for (const site of sites) {
    const key = normalizeForDedupe(site.url);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(site);
  }
  return unique;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const runSettings = { ...settings };
  if (opts.headless) runSettings.headless = true;
  // Nothing to solve a CAPTCHA in when there's no visible window — pausing
  // would just burn captchaWaitMinutes on every one before auto-skipping.
  if (runSettings.headless) runSettings.pauseOnCaptcha = false;

  let sites = dedupeSites(allSites);
  if (opts.limit) sites = sites.slice(0, opts.limit);

  const browsersToRun = opts.only ? settings.browsers.filter((b) => opts.only.includes(b)) : settings.browsers;

  console.log(`Target URLs (random per attempt): ${runSettings.targetUrls.join(', ')}`);
  console.log(`Sites: ${sites.length} unique | Browsers: ${browsersToRun.join(', ')}`);
  console.log(`Headless: ${runSettings.headless} | Pause on CAPTCHA: ${runSettings.pauseOnCaptcha}\n`);

  const logger = new RunLogger(runSettings);

  await Promise.all(
    browsersToRun.map((browserName) =>
      runBrowserWorker({ browserName, sites, settings: runSettings, pickKeyword, pickTargetUrl, logger })
    )
  );

  const jsonPath = logger.writeJson();
  const summary = logger.summary();
  writeHtmlReport(logger.htmlPath, summary, logger.results);

  await sendReportEmail({ settings: runSettings, summary, htmlPath: logger.htmlPath, jsonPath });

  console.log('\n=== Summary ===');
  console.log(`Total attempts: ${summary.totalAttempts}`);
  console.log('By status:', summary.byStatus);
  console.log('By browser:', summary.byBrowser);
  console.log(`\nJSON report: ${jsonPath}`);
  console.log(`HTML report: ${logger.htmlPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
