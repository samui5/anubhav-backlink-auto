const { settings, pickKeyword, pickTargetUrl } = require('./config/settings');
const allSites = require('./config/sites');
const allDirectories = require('./config/directories');
const { runBrowserWorker } = require('./src/worker');
const { RunLogger } = require('./src/logger');
const { writeHtmlReport } = require('./src/report');
const { sendReportEmail } = require('./src/mailer');
const { findWorkingProxy } = require('./src/proxy');
const { discoverTargets } = require('./src/discovery');
const { updateReliability } = require('./src/reliability');
const { syndicateContent } = require('./src/syndication');
const { shareToSocial } = require('./src/social');

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

// Merges src/discovery.js's fresh sitemap pages + video URLs into the
// static config/settings.js target list (Idea #1/#2), deduping so a page
// that's both hand-listed and freshly discovered doesn't skew how often
// it's picked. Falls back to just the static list if discovery found
// nothing or is disabled — this can never make the pool empty.
//
// Deliberately NOT normalizeForDedupe here (that one drops the query
// string, which is exactly where every YouTube video's ?v=... id lives —
// using it collapsed all 10 discovered videos down to 1 in testing). A
// plain trimmed/lower-cased exact match is the right level of dedup for a
// pool of already-curated full page URLs.
function normalizeUrlForPool(url) {
  return url.trim().toLowerCase().replace(/\/$/, '');
}

function buildTargetPool(staticUrls, discovered) {
  const discoveredUrls = [...discovered.sitemapUrls, ...discovered.videos.map((v) => v.url)];
  const seen = new Set();
  const pool = [];
  for (const url of [...staticUrls, ...discoveredUrls]) {
    const key = normalizeUrlForPool(url);
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(url);
  }
  return pool;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const runSettings = { ...settings };
  if (opts.headless) runSettings.headless = true;
  // Nothing to solve a CAPTCHA in when there's no visible window — pausing
  // would just burn captchaWaitMinutes on every one before auto-skipping.
  if (runSettings.headless) runSettings.pauseOnCaptcha = false;

  let sites = dedupeSites([...allSites, ...allDirectories]);
  if (opts.limit) sites = sites.slice(0, opts.limit);

  const browsersToRun = opts.only ? settings.browsers.filter((b) => opts.only.includes(b)) : settings.browsers;

  if (runSettings.proxyCountry) {
    console.log(`Resolving a free proxy for ${runSettings.proxyCountry}...`);
    runSettings.proxy = await findWorkingProxy(runSettings.proxyCountry);
  }

  console.log('Discovering fresh target URLs (sitemap + YouTube feed)...');
  const discovered = await discoverTargets(runSettings);
  for (const err of discovered.errors) console.log(`  discovery warning: ${err}`);
  console.log(
    `  found ${discovered.sitemapUrls.length} sitemap page(s), ${discovered.videos.length} video(s)`
  );
  runSettings.targetUrls = buildTargetPool(runSettings.targetUrls, discovered);

  console.log(`Target URLs (random per attempt): ${runSettings.targetUrls.join(', ')}`);
  if (runSettings.proxyCountry) {
    console.log(
      runSettings.proxy
        ? `Proxy: ${runSettings.proxy.server} (${runSettings.proxy.country})`
        : `Proxy: none reachable for ${runSettings.proxyCountry} — running direct`
    );
  }
  console.log(`Sites: ${sites.length} unique | Browsers: ${browsersToRun.join(', ')}`);
  console.log(`Headless: ${runSettings.headless} | Pause on CAPTCHA: ${runSettings.pauseOnCaptcha}\n`);

  const logger = new RunLogger(runSettings);

  await Promise.all(
    browsersToRun.map((browserName) =>
      runBrowserWorker({ browserName, sites, settings: runSettings, pickKeyword, pickTargetUrl, logger })
    )
  );

  console.log('\nUpdating site-reliability history...');
  const reliability = updateReliability(runSettings.reliability.ledgerPath, logger.results, new Date().toISOString());
  if (reliability.flagged.length) {
    console.log('  flagged (rolling success rate below 50% over several runs):');
    for (const f of reliability.flagged) {
      console.log(`    ${f.site}: ${f.submitted}/${f.attempts} (${Math.round(f.rate * 100)}%)`);
    }
  }

  console.log('\nSyndicating new content to Dev.to/Hashnode (if configured)...');
  const syndication = await syndicateContent(runSettings, discovered);
  for (const p of syndication.posted) console.log(`  posted: ${p.title} -> ${p.devto || p.hashnode || ''}`);
  for (const e of syndication.errors) console.log(`  syndication error (${e.kind} ${e.ref}): ${e.message}`);

  console.log('\nSharing to social platforms (if configured)...');
  const socialTarget = runSettings.targetUrls[Math.floor(Math.random() * runSettings.targetUrls.length)];
  const social = await shareToSocial(socialTarget, pickKeyword(0), runSettings);
  for (const p of social.posted) console.log(`  shared on ${p.platform}: ${p.url || '(posted)'}`);
  for (const e of social.errors) console.log(`  social error (${e.platform}): ${e.message}`);

  const enrichment = { discovered, reliability, syndication, social };
  const jsonPath = logger.writeJson(enrichment);
  const summary = logger.summary();
  writeHtmlReport(logger.htmlPath, summary, logger.results, enrichment);

  await sendReportEmail({ settings: runSettings, summary, htmlPath: logger.htmlPath, jsonPath, enrichment });

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
