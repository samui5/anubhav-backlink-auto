// Each entry is one backlink/ping site.
//
// `verified: true` means the selectors below were checked against the live
// site and a `run()` was written for its actual form. `verified: false`
// entries have no site-specific `run()` and fall back to the heuristic
// engine in src/engine.js (it hunts for a URL-ish input, an optional
// keyword-ish input, and a submit-ish button). Heuristics are inherently
// best-effort: these sites redesign their pages often, so expect some of
// them to fail or need a selector fix — check the log report.
//
// Policy: sites confirmed to sit behind a CAPTCHA or bot wall (reCAPTCHA,
// hCaptcha, Cloudflare, an inline "Image Verification"/math-question field,
// etc) are not kept here at all — their entries are deleted outright rather
// than marked/worked around. SmallSEOTools, Pingler, SearchEngineReports,
// and DupliChecker were removed on 2026-09-12 for exactly that reason
// (DupliChecker sits behind Cloudflare, which throws an "Attention
// Required" challenge specifically at automated/headless browsers —
// confirmed via a live headless test run). `site.protected` still exists as
// plumbing in src/worker.js for any future site that turns out to need it,
// but nothing here currently uses it.
//
// Same policy for confirmed-dead sites: verified via direct curl (not just a
// CI run, since a CI-only failure could be an IP block rather than a dead
// site) on 2026-09-12. MySitesLink (us.mysiteslink.com doesn't resolve),
// PingMyLink (pingmylink.com times out on every request), TotalPing
// (totalping.com loads but its form is gone — the page is now just a
// livescore widget, no URL submission left), and PingMyUrl Social
// (pingmyurl.com/social returns an empty page, no form at all) were removed
// outright rather than left to fail every run.
//
// --- 2026-09-13 cleanup + expansion ------------------------------------
// A live headless run (chromium, 56 sites) showed the entire "legacy
// ping-service list" block below this one — 38 sites, mostly 2005-2010 era
// blog-ping directories — failing 36/38 (dead domains or XML-RPC endpoints
// with no browser-facing form; that's expected and honest, not a bug, per
// the original note on that block). The two survivors (BulkPing, FeedShark)
// were individually re-checked: BulkPing is a live, modern, no-captcha site
// and was promoted into the main list below with a real `run()`; FeedShark
// was found to have a required numeric "verify" field (a plain math/human
// check with no iframe — the kind src/engine.js's iframe-based
// detectCaptcha() can't see) and was dropped under the CAPTCHA policy
// above. The rest of that dead block was deleted outright.
//
// Also dropped from the previously-"working" set: SEOSpaceship Tools (dead —
// connection timeout, confirmed via curl too), PingSitemap (resolves but is
// a parked/placeholder page with no real form), FeedBurner Ping (Google
// retired this endpoint years ago, 404s), and Free Web Submission (UK) /
// ExciteSubmit (neither is actually a backlink/ping submission — the first
// is an AWeber mailing-list opt-in, the second's only working field is an
// IndexNow-key-gated URL analyzer — so counting either as a "submission"
// would be misleading even though the generic engine can technically fill
// them without erroring).
//
// Pingdom Tools, PingMyUrls, PingFarm, and Free-Backlinks.net Ping URL were
// upgraded from generic-heuristic (verified: false) to real hand-written
// `run()`s after confirming their actual selectors live.
//
// 28 new sites were initially researched and added, each individually
// live-tested headless (from a residential IP) with a real submission (not
// just a page load) to confirm a genuine success response (e.g. "Thanks for
// the ping." / a backlink-check results table) with zero CAPTCHA. Most
// belong to one of two widely-resold "free SEO tools" script families that
// show up on dozens of independent agency domains: an "online ping website
// tool" (fields #myurl/#blogNameData/#myBlogUpdateUrlData/#myBlogRSSFeedUrlData,
// button #checkButton) and a "backlink maker" (just #myurl + #checkButton,
// returns a table of authority sites that now reference the submitted URL).
// Many candidate domains running the same two scripts were checked and
// rejected for having a bolted-on CAPTCHA (7boats, smallseo.tools,
// smartseotools.org, smallseotools.co.uk all show an "Image Verification"
// field on this exact template), being dead/parked/hijacked
// (superseoplus.com, digitalqueen.co.uk, coolseotools.com, free-seo-tools.org
// — the last now squatted by a gambling spam page), or requiring an
// account/API key/lead-gen form instead of a plain submission (w3era,
// vefogix.com, pingoat.com, the IndexNow-key tools, easyprotools.com's
// "backlink generator" which just opens 100+ third-party tool tabs rather
// than submitting anywhere itself).
//
// One real finding from that research: smallseo.tools threw up a login
// modal AND a Mailchimp signup modal stacked on top of its form, which is
// exactly the "extra popup, not a captcha" case — see dismissPopups() in
// src/engine.js, added specifically for this and now run on every site
// before dismissCookieBanners's cousin. (smallseo.tools itself was still
// excluded afterward — once the popups were out of the way, it turned out
// to also have the same Image Verification field as the sites above.)
//
// --- 2026-09-13 second pass: pruned after a real GitHub Actions run -----
// The first pass above was all verified from one residential IP, which
// undersells a real failure mode: several of these free-tools domains sit
// behind bot-detection (Cloudflare or similar) tuned to challenge
// datacenter/cloud IP ranges specifically — invisible from a home network,
// but a live workflow_dispatch run on GitHub's ubuntu-latest runners (4
// browsers x 42 sites) showed 17 of the newly-added sites failing or
// captcha-walled on literally every browser: SEO Tool Checkers, CoderDuck,
// ToolsZoo, and Small-SEO-Tool.com (both pages each) plus SEOToolr Backlink
// Maker all came back skipped-captcha on all 4 browsers in CI despite
// having been captcha-free from home; King of SEO Tools (both pages),
// BulkPing, and A to Z SEO Tools/wongcw (both pages) all hung in a
// self-redirect navigation loop on every browser in CI (wongcw specifically
// turned out to now redirect straight to a login page — likely rate-limited
// after this same research's repeated manual hits); SEO Magnifier Backlinks
// Maker, NimTools Backlink Maker, PingMyLinks SEO Tools' ping page, and
// Bright SEO Tools all failed on 3-4 of the 4 browsers. All of those were
// removed. Kept: Next Big Technology, SEO Wagon, Simplified SEO Tools, and
// Quick Rank Tools (both pages each), plus SEO Tools Centre's ping page,
// Digital Web Services Backlink Maker (3/4 in that run), and Wormly — all
// 4/4 or 3/4 clean in the same CI run, so evidently not on whatever
// IP-reputation list caught the rest.

const sites = [
  {
    name: 'Site24x7 Ping Test',
    url: 'https://www.site24x7.com/ping-test.html',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, 'input[placeholder="www.example.com"]', ctx.url);
      await page.click('button:has-text("Ping Now")');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'Pingdom Tools',
    url: 'https://tools.pingdom.com/',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, 'input[placeholder="www.example.com"]', ctx.url);
      await page.click('input.test-button');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'PrepostSEO Ping Multiple URLs',
    url: 'https://www.prepostseo.com/ping-multiple-urls-online',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, '#urls', ctx.url);
      // #checkBtn exists in the DOM but is display:none for this page
      // variant — #stepOne is the button actually shown to visitors.
      await page.click('#stepOne');
      await page.waitForSelector('#pingConfirm', { timeout: ctx.settings.actionTimeoutMs }).catch(() => {});
      await page.click('#pingConfirm').catch(() => {});
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'PingMyLinks Add URL',
    url: 'https://www.pingmylinks.com/addurl/',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, '#fMain #furl', ctx.url);
      await page.click('#fMain input[name="button"]');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'PingMyUrls',
    url: 'https://pingmyurls.com/',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, '#fMain #furl', ctx.url);
      await page.click('#fMain input[name="button"]');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'PingFarm',
    url: 'http://pingfarm.com/',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, 'textarea[name="urls"]', ctx.url);
      await ctx.type(page, 'input[name="title"]', ctx.keyword);
      await page.click('input[value="MASS PING!"]');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'Ping-O-Matic',
    url: 'http://pingomatic.com/',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, '#title', ctx.keyword);
      await ctx.type(page, '#blogurl', ctx.url);
      await page.check('#chk_blogs').catch(() => {});
      await page.check('#chk_feedburner').catch(() => {});
      await page.evaluate(() => document.getElementById('pingform').submit());
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'Free-Backlinks.net Ping URL',
    url: 'http://free-backlinks.net/ping-my-url.html',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, 'input[name="url"]', ctx.url);
      await ctx.type(page, 'input[name="title"]', ctx.keyword);
      await page.click('input[value="Start Pinging"]');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'PrepostSEO Backlinks Maker',
    url: 'https://www.prepostseo.com/backlinks-maker',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, '#inputURL', ctx.url);
      await page.click('#checkBrokenLinks');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  // --- No-CAPTCHA replacements added 2026-09-12 -------------------------
  // Sourced by web research + live verification (filled the real form and
  // confirmed a genuine "Thanks for the ping." / "OK" success response with
  // no CAPTCHA of any kind) to replace the 4 sites removed for having one
  // (SmallSEOTools, Pingler, SearchEngineReports, DupliChecker). Several
  // other researched candidates were rejected after live-checking: onwardSEO
  // (widget never loads — broken), SEOToolspark and HostNamaste (both use
  // the same underlying template as Naklov/SEOQueen below but have a
  // reCAPTCHA / image CAPTCHA bolted on), MegriTools (submit hangs forever
  // — broken).
  {
    name: 'Naklov Online Ping Website Tool',
    url: 'https://naklov.com/en/seo-tools/online-ping-website-tool',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, '#myurl', ctx.url);
      await ctx.type(page, '#blogNameData', ctx.keyword);
      await ctx.type(page, '#myBlogUpdateUrlData', ctx.url);
      await ctx.type(page, '#myBlogRSSFeedUrlData', `${ctx.url}/feed`);
      await page.click('#checkButton');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'SEOQueen Online Ping Website Tool',
    url: 'https://www.seoqueen.com/seo-tools/online-ping-website-tool',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, '#myurl', ctx.url);
      await ctx.type(page, '#blogNameData', ctx.keyword);
      await ctx.type(page, '#myBlogUpdateUrlData', ctx.url);
      await ctx.type(page, '#myBlogRSSFeedUrlData', `${ctx.url}/feed`);
      await page.click('#checkButton');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'MassPingTool',
    url: 'https://masspingtool.com/',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, 'textarea[placeholder="Enter URLs here"]', ctx.url);
      await page.click('button:has-text("Mass Ping")');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'WMTools Mass Ping',
    url: 'https://wmtools.me/mass-ping',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, 'textarea[placeholder="https://wmtools.me"]', ctx.url);
      // Rendered as "PING" via CSS text-transform, but the actual text node
      // is "Ping" — match case-insensitively and scope to the primary
      // button so the FAQ accordion items (which also mention "ping") don't
      // match instead.
      await page.click('button.primary:has-text("ping")');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },

  // --- 30 new sites added 2026-09-13 -------------------------------------
  // See the file-level comment above for how these were sourced/verified
  // and what was rejected along the way. The "online ping website tool" and
  // "backlink maker" run()s below are deliberately identical in shape to
  // Naklov/SEOQueen and PrepostSEO Backlinks Maker above — same underlying
  // script, different domain — copied per-site rather than factored into a
  // shared helper to match this file's existing convention of one
  // self-contained entry per site.
  {
    name: 'Next Big Technology Online Ping Website Tool',
    url: 'https://nextbigtechnology.com/seo-check/online-ping-website-tool',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, '#myurl', ctx.url);
      await ctx.type(page, '#blogNameData', ctx.keyword);
      await ctx.type(page, '#myBlogUpdateUrlData', ctx.url);
      await ctx.type(page, '#myBlogRSSFeedUrlData', `${ctx.url}/feed`);
      await page.click('#checkButton');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'Next Big Technology Backlink Maker',
    url: 'https://nextbigtechnology.com/seo-check/backlink-maker',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, '#myurl', ctx.url);
      await page.click('#checkButton');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'SEO Wagon Online Ping Website Tool',
    url: 'https://seowagon.com/online-ping-website-tool',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, '#myurl', ctx.url);
      await ctx.type(page, '#blogNameData', ctx.keyword);
      await ctx.type(page, '#myBlogUpdateUrlData', ctx.url);
      await ctx.type(page, '#myBlogRSSFeedUrlData', `${ctx.url}/feed`);
      await page.click('#checkButton');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'SEO Wagon Backlink Maker',
    url: 'https://seowagon.com/backlink-maker',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, '#myurl', ctx.url);
      await page.click('#checkButton');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'SEO Tools Centre Online Ping Website Tool',
    url: 'https://seotoolscentre.com/online-ping-website-tool',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, '#myurl', ctx.url);
      await ctx.type(page, '#blogNameData', ctx.keyword);
      await ctx.type(page, '#myBlogUpdateUrlData', ctx.url);
      await ctx.type(page, '#myBlogRSSFeedUrlData', `${ctx.url}/feed`);
      await page.click('#checkButton');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'Simplified SEO Tools Online Ping Website Tool',
    url: 'https://simplifiedseotools.com/online-ping-website-tool',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, '#myurl', ctx.url);
      await ctx.type(page, '#blogNameData', ctx.keyword);
      await ctx.type(page, '#myBlogUpdateUrlData', ctx.url);
      await ctx.type(page, '#myBlogRSSFeedUrlData', `${ctx.url}/feed`);
      await page.click('#checkButton');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'Simplified SEO Tools Backlink Maker',
    url: 'https://simplifiedseotools.com/backlink-maker',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, '#myurl', ctx.url);
      await page.click('#checkButton');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'Quick Rank Tools Online Ping Website Tool',
    url: 'https://www.quickranktools.com/online-ping-website-tool',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, '#myurl', ctx.url);
      await ctx.type(page, '#blogNameData', ctx.keyword);
      await ctx.type(page, '#myBlogUpdateUrlData', ctx.url);
      await ctx.type(page, '#myBlogRSSFeedUrlData', `${ctx.url}/feed`);
      await page.click('#checkButton');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'Quick Rank Tools Backlink Maker',
    url: 'https://www.quickranktools.com/backlink-maker',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, '#myurl', ctx.url);
      await page.click('#checkButton');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'Digital Web Services Backlink Maker',
    url: 'https://www.digital-web-services.com/marketing-seo-tools/backlink-maker',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, '#myurl', ctx.url);
      await page.click('#checkButton');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
  {
    name: 'Wormly Remote Ping Test',
    url: 'https://www.wormly.com/test-remote-ping',
    verified: true,
    async run(page, ctx) {
      await ctx.type(page, '#sensor-1-1-host', ctx.url.replace(/^https?:\/\//, '').replace(/\/$/, ''));
      await page.click('#cs_test');
      await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
    },
  },
];

module.exports = sites;
