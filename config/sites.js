// Each entry is one backlink/ping site.
//
// `verified: true` means the selectors below were checked against the live
// site on 2026-09-12 and a `run()` was written for its actual form.
// `verified: false` entries have no site-specific `run()` and fall back to
// the heuristic engine in src/engine.js (it hunts for a URL-ish input, an
// optional keyword-ish input, and a submit-ish button). Heuristics are
// inherently best-effort: these sites redesign their pages often, so expect
// some of them to fail or need a selector fix — check the log report.
//
// Policy: sites confirmed to sit behind a CAPTCHA or bot wall (reCAPTCHA,
// hCaptcha, Cloudflare, etc) are not kept here at all — their entries are
// deleted outright rather than marked/worked around. SmallSEOTools, Pingler,
// SearchEngineReports, and DupliChecker were removed on 2026-09-12 for
// exactly that reason (DupliChecker sits behind Cloudflare, which throws an
// "Attention Required" challenge specifically at automated/headless
// browsers — confirmed via a live headless test run). `site.protected`
// still exists as plumbing in src/worker.js for any future site that turns
// out to need it, but nothing here currently uses it.

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
    verified: false,
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
  { name: 'PingMyUrls', url: 'https://pingmyurls.com/', verified: false },
  { name: 'PingMyUrl Social', url: 'http://www.pingmyurl.com/social/', verified: false },
  { name: 'PingFarm', url: 'http://pingfarm.com/', verified: false },
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
  { name: 'PingMyLink (singular)', url: 'http://www.pingmylink.com/', verified: false },
  { name: 'SEOSpaceship Tools', url: 'https://www.seospaceship.com/tools/', verified: false },
  {
    name: 'Free Web Submission (UK)',
    url: 'http://www.free-web-submission.co.uk/index9.html',
    verified: false,
  },
  { name: 'ExciteSubmit', url: 'https://excitesubmit.com/', verified: false },
  { name: 'MySitesLink', url: 'https://us.mysiteslink.com/', verified: false },
  { name: 'Free-Backlinks.net Ping URL', url: 'http://free-backlinks.net/ping-my-url.html', verified: false },
  { name: 'PingSitemap', url: 'http://pingsitemap.com/', verified: false },
  { name: 'TotalPing', url: 'https://totalping.com/', verified: false },
  {
    name: 'FeedBurner Ping',
    url: 'https://feedburner.google.com/fb/a/ping',
    verified: false,
    note: 'Google retired most of FeedBurner years ago; this endpoint is likely dead. Kept for completeness.',
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

  // --- Legacy ping-service list added 2026-09-12 -----------------------
  // Mostly old (2005-2010 era) blog-ping directories. Several are plain
  // XML-RPC endpoints (weblogUpdates.ping-style APIs meant to be called by
  // blogging software, not a browser) rather than pages with a form, and a
  // number of these domains no longer resolve at all after this many years.
  // Both cases surface honestly as `failed` in the report (no form found /
  // navigation error) via the generic engine below — that's expected, not a
  // bug. None of these were verified live; fix a selector here if one of
  // them turns out to have a real form and keeps failing.
  { name: 'Google Blog Search Ping', url: 'http://www.blogsearch.google.com/ping', verified: false },
  { name: 'AddUrl.nu', url: 'http://addurl.nu/', verified: false },
  { name: 'FeedBurner Ping (legacy)', url: 'http://ping.feedburner.com', verified: false },
  { name: 'PingMyBlog', url: 'http://pingmyblog.com/', verified: false },
  { name: 'GooglePing', url: 'http://googleping.com', verified: false },
  { name: 'BacklinkPing', url: 'http://www.backlinkping.com', verified: false },
  { name: 'IndexKings', url: 'http://indexkings.com', verified: false },
  { name: 'PingBomb', url: 'http://pingbomb.com', verified: false },
  { name: 'FeedShark', url: 'http://feedshark.brainbliss.com', verified: false },
  { name: 'Twingly Ping', url: 'http://twingly.com/ping', verified: false },
  { name: 'Ping.in', url: 'http://ping.in', verified: false },
  { name: 'Weblogs.com', url: 'http://www.weblogs.com/', verified: false },
  { name: 'IceRocket', url: 'http://icerocket.com/', verified: false },
  { name: 'Auto-Ping', url: 'http://auto-ping.com/', verified: false },
  { name: 'MyPageRank Ping Service', url: 'http://mypagerank.net/service_pingservice_index', verified: false },
  { name: 'iPings', url: 'http://ipings.com', verified: false },
  { name: 'Blo.gs', url: 'http://blo.gs/', verified: false },
  { name: 'AutoPinger', url: 'http://www.autopinger.com/', verified: false },
  { name: 'Bitacoras', url: 'http://bitacoras.com/', verified: false },
  { name: 'GeoURL Ping', url: 'http://geourl.org/ping', verified: false },
  { name: 'BlogBuzzer', url: 'http://blogbuzzer.com', verified: false },
  { name: 'Pingerati', url: 'http://www.pingerati.net', verified: false },
  { name: 'BulkFeeds RPC', url: 'http://bulkfeeds.net/rpc', verified: false },
  { name: 'Pingates', url: 'http://pingates.com', verified: false },
  { name: 'BlogMatcher', url: 'http://blogmatcher.com', verified: false },
  { name: 'Syncr', url: 'http://syncr.com', verified: false },
  { name: 'PingGator', url: 'http://pinggator.com', verified: false },
  { name: 'Blogg.de XML-RPC', url: 'http://xmlrpc.blogg.de', verified: false },
  { name: 'Blo.gs Ping Endpoint', url: 'http://ping.blo.gs', verified: false },
  { name: 'BulkPing', url: 'http://www.bulkping.com/', verified: false },
  { name: 'BlogSnow Ping', url: 'http://www.blogsnow.com/ping', verified: false },
  { name: 'Feedster Ping', url: 'http://api.feedster.com/ping', verified: false },
  { name: 'BlogShares RPC', url: 'http://www.blogshares.com/rpc.php', verified: false },
  { name: 'AllPodcasts', url: 'http://www.allpodcasts.com/', verified: false },
  { name: 'Moreover Ping', url: 'http://api.moreover.com/ping', verified: false },
  { name: 'Bitacoras Ping Endpoint', url: 'http://ping.bitacoras.com', verified: false },
  { name: 'Amagle Ping', url: 'http://ping.amagle.com/', verified: false },
  { name: 'BlogPingTool', url: 'http://www.blogpingtool.com', verified: false },
];

module.exports = sites;
