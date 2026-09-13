const { launch } = require('./browsers');
const {
  detectCaptcha,
  pauseIfCaptcha,
  clickAndHandleCaptcha,
  typeLikeHuman,
  dismissCookieBanners,
  dismissPopups,
  genericSubmit,
  CaptchaSkipped,
} = require('./engine');

// Runs one browser engine through the full site list, serially, submitting
// ctx.targetUrl (with a rotating keyword) to each one. Returns an array of
// result entries; never throws — per-site failures are captured as entries.
async function runBrowserWorker({ browserName, sites, settings, pickKeyword, pickTargetUrl, logger }) {
  const label = browserName;
  let browser;
  let context;
  const results = [];

  try {
    ({ browser, context } = await launch(browserName, settings));
    context.setDefaultTimeout(settings.actionTimeoutMs);
    context.setDefaultNavigationTimeout(settings.navigationTimeoutMs);
  } catch (err) {
    // Whole engine failed to launch (e.g. Opera not installed): log one
    // failed entry per site so the report still reflects the gap.
    for (const site of sites) {
      const entry = {
        browser: label,
        site: site.name,
        url: site.url,
        keyword: '',
        target: '',
        status: 'failed',
        message: `Browser launch failed: ${err.message}`,
        durationMs: 0,
      };
      logger.record(entry);
      results.push(entry);
    }
    return results;
  }

  const page = await context.newPage();

  for (let i = 0; i < sites.length; i += 1) {
    const site = sites[i];
    const keyword = pickKeyword(i);
    const target = pickTargetUrl(settings);
    const started = Date.now();
    const entry = { browser: label, site: site.name, url: site.url, keyword, target, status: '', message: '', durationMs: 0 };

    try {
      await page.goto(site.url, { waitUntil: 'domcontentloaded' });
      await dismissCookieBanners(page);
      await dismissPopups(page);

      if (site.protected === 'cloudflare') {
        const captcha = await detectCaptcha(page);
        entry.status = 'skipped-protected';
        entry.message = site.note || `Known bot-check (${site.protected})${captcha.found ? ': confirmed present' : ''}`;
      } else {
        const ctx = {
          url: target,
          keyword,
          category: settings.category,
          // Only config/directories.js entries need this (richer forms —
          // business name/category/description/email — than a plain
          // ping/backlink-maker's URL + optional keyword); harmless for
          // every config/sites.js entry, which never reads it.
          business: settings.business,
          settings,
          label,
          clickAndHandleCaptcha: (p, selector) => clickAndHandleCaptcha(p, selector, ctx),
          type: (p, selector, text) => typeLikeHuman(p, selector, text),
          checkCaptcha: () => pauseIfCaptcha(page, ctx),
        };

        await pauseIfCaptcha(page, ctx);

        if (typeof site.run === 'function') {
          await site.run(page, ctx);
        } else {
          await genericSubmit(page, ctx);
        }

        entry.status = 'submitted';
        entry.message = site.verified ? '' : 'generic heuristic engine (unverified selectors)';
      }
    } catch (err) {
      if (err instanceof CaptchaSkipped) {
        entry.status = 'skipped-captcha';
        entry.message = err.message;
      } else {
        entry.status = 'failed';
        entry.message = err.message;
      }
    }

    entry.durationMs = Date.now() - started;
    logger.record(entry);
    results.push(entry);
  }

  await context.close();
  await browser.close();
  return results;
}

module.exports = { runBrowserWorker };
