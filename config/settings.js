const path = require('path');

const settings = {
  // The links being promoted. A random one (see pickTargetUrl below) is
  // submitted per site attempt, so backlinks spread across specific pages
  // instead of every single one pointing at the homepage. Override the
  // whole list with a comma-separated TARGET_URLS env var, or force every
  // submission to one single link with TARGET_URL (handy in Docker/CI).
  targetUrls: process.env.TARGET_URL
    ? [process.env.TARGET_URL]
    : process.env.TARGET_URLS
    ? process.env.TARGET_URLS.split(',').map((u) => u.trim()).filter(Boolean)
    : [
        'https://www.anubhavtrainings.com/',
        'https://www.anubhavtrainings.com/scp-cloud-platform-training',
        'https://www.anubhavtrainings.com/restful-programming-training',
        'https://www.anubhavtrainings.com/ui5-and-odata-training',
        'https://www.anubhavtrainings.com/aoh-cds-amdp-training',
        'https://www.youtube.com/@AnubhavOberoy',
      ],

  // Rotated across sites that ask for a keyword / title / tag. Override
  // with a comma-separated PING_KEYWORDS env var.
  keywords: process.env.PING_KEYWORDS
    ? process.env.PING_KEYWORDS.split(',').map((k) => k.trim()).filter(Boolean)
    : ['sap btp training', 'sap cap training', 'sap rap training', 'sap gen ai course'],

  // Used by sites that ask for a topic/category dropdown or checkbox list.
  category: 'Education',

  // Which browser engines to run in parallel. Each one works through the
  // full site list independently and on its own schedule. See
  // src/browsers.js for how each is launched — chrome/edge/chromium are all
  // Chromium-based (chrome and edge are real installed browsers via
  // Playwright's "channel" mechanism, chromium is Playwright's own bundled
  // build), firefox is Playwright's bundled Firefox, and opera is spawned
  // directly and attached to over CDP (Opera's Chromium base doesn't speak
  // Playwright's newer launch() transport) — opera is unreliable headless on
  // Linux (Docker/CI) but left in the default list since it's untested and
  // may work fine locally; --only=chrome,firefox,edge,chromium leaves it out.
  browsers: ['chrome', 'edge', 'chromium', 'firefox', 'opera'],

  // Run with visible windows so a CAPTCHA can be solved by hand when one
  // shows up (see pauseOnCaptcha below). Set to true for unattended runs
  // (any site that hits a CAPTCHA will just be logged as skipped).
  headless: false,

  slowMoMs: 150,
  navigationTimeoutMs: 30000,
  actionTimeoutMs: 15000,
  postSubmitWaitMs: 20000,

  // When a CAPTCHA / bot-check is detected, pause that browser and wait for
  // a human to solve it in the visible window before continuing.
  pauseOnCaptcha: true,
  captchaWaitMinutes: 3,

  // Opera is Chromium-based but not a Playwright "channel", so it's driven
  // via chromium.launch({ executablePath }). Override with the OPERA_PATH
  // env var if Opera isn't installed at one of these default locations.
  operaExecutablePaths: [
    process.env.OPERA_PATH,
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Opera', 'opera.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Opera GX', 'opera.exe'),
    'C:\\Program Files\\Opera\\opera.exe',
    'C:\\Program Files (x86)\\Opera\\opera.exe',
    '/usr/bin/opera', // Docker / Linux CI (installed via apt, see Dockerfile)
    '/usr/bin/opera-stable',
  ].filter(Boolean),

  // Chromium-based engines (chrome, opera) need --no-sandbox to launch as
  // root with no user namespaces, which is the norm for a Docker container
  // or a CI runner — CI=true is set automatically by GitHub Actions, and
  // the Dockerfile sets DOCKER=true. Left empty for normal local use, where
  // the sandbox should stay on.
  chromiumArgs:
    process.env.CI || process.env.DOCKER
      ? ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      : [],

  logsDir: path.join(__dirname, '..', 'logs'),

  // Routes every browser engine through a free public proxy in this
  // country for the whole run (US/AU/CA/DE/SG, or any 2-letter country
  // code — see src/proxy.js). Resolved once at startup in index.js (it
  // needs an async network call, so it can't live here) and attached to
  // runSettings.proxy; null if PROXY_COUNTRY isn't set, or if none of that
  // country's free candidates turned out to be reachable (the run still
  // proceeds without one rather than failing — see index.js).
  proxyCountry: process.env.PROXY_COUNTRY || null,
  proxy: null,

  // Emails the final HTML + JSON report after every run, success or
  // failure. Sent via Gmail SMTP with an App Password (needs 2-Step
  // Verification turned on for the sending account) — see src/mailer.js.
  // Disabled automatically if GMAIL_APP_PASSWORD isn't set (e.g. local
  // runs where you haven't configured it), so nothing breaks by default.
  email: {
    enabled: process.env.SEND_REPORT_EMAIL !== 'false',
    from: process.env.EMAIL_FROM || 'wednesday.ui5@gmail.com',
    to: process.env.EMAIL_TO || 'anubhav.abap@gmail.com',
    appPassword: process.env.GMAIL_APP_PASSWORD || '',
  },

  // Pulls fresh target URLs at the start of every run instead of only ever
  // hitting the static list above — a new blog post (sitemap.xml) or a new
  // video (the channel's public upload feed, no API key needed) is picked
  // up automatically and merged into the pool pickTargetUrl() draws from.
  // See src/discovery.js. Both sources are best-effort and never fail the
  // run: a broken/unreachable sitemap or a channel handle that fails to
  // resolve just means discovery contributes nothing that run, logged as an
  // error in the report rather than thrown.
  discovery: {
    enabled: process.env.DISCOVERY_ENABLED !== 'false',
    sitemapUrl: process.env.SITEMAP_URL || 'https://www.anubhavtrainings.com/sitemap.xml',
    maxSitemapUrls: Number(process.env.MAX_SITEMAP_URLS || 20),
    youtubeChannelUrl: process.env.YOUTUBE_CHANNEL_URL || 'https://www.youtube.com/@AnubhavOberoy',
    maxYoutubeUrls: Number(process.env.MAX_YOUTUBE_URLS || 10),
  },

  // Business profile used by directory-style sites in config/directories.js
  // that ask for more than just a URL (name/category/description/email),
  // unlike the plain ping/backlink-maker sites in config/sites.js.
  business: {
    name: process.env.BUSINESS_NAME || 'Anubhav Trainings',
    category: process.env.BUSINESS_CATEGORY || 'Education & Training',
    description:
      process.env.BUSINESS_DESCRIPTION ||
      'Corporate and self-paced training on SAP BTP, CAP, RAP, UI5/OData, and Generative AI.',
    email: process.env.BUSINESS_EMAIL || '',
  },

  // Cross-posts new content as real articles on Dev.to / Hashnode via their
  // official APIs (not form-scraping) with a canonical link back to the
  // original page — see src/syndication.js. Each is independently disabled
  // unless its API key/token env var is set, so this is a no-op until you
  // add credentials (see README.md for how to get each one). Recap articles
  // for new videos are only generated when anthropicApiKey is also set
  // (src/transcripts.js fetches the caption track, src/syndication.js calls
  // the Claude API to turn it into a short post) — skipped otherwise.
  syndication: {
    devto: {
      enabled: !!process.env.DEVTO_API_KEY,
      apiKey: process.env.DEVTO_API_KEY || '',
    },
    hashnode: {
      enabled: !!(process.env.HASHNODE_TOKEN && process.env.HASHNODE_PUBLICATION_ID),
      token: process.env.HASHNODE_TOKEN || '',
      publicationId: process.env.HASHNODE_PUBLICATION_ID || '',
    },
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    // Videos already turned into a recap post are recorded here (see
    // src/syndication.js) so the same video isn't re-syndicated every run.
    ledgerPath: path.join(__dirname, '..', 'logs', 'syndicated.json'),
  },

  // Shares each run's target links to social profiles via official REST
  // APIs (not browser automation — these platforms' ToS and bot-detection
  // make form-filling both fragile and risky). Each platform independently
  // disabled unless its credentials are set — see README.md for how to
  // obtain them (all three require creating a developer app on that
  // platform; none of that can be done by this codebase on its own).
  social: {
    twitter: {
      enabled: !!process.env.TWITTER_BEARER_TOKEN,
      bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
    },
    linkedin: {
      enabled: !!(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_ACTOR_URN),
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN || '',
      actorUrn: process.env.LINKEDIN_ACTOR_URN || '',
    },
    facebook: {
      enabled: !!(process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID),
      pageAccessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '',
      pageId: process.env.FACEBOOK_PAGE_ID || '',
    },
  },

  // Rolling per-site success-history ledger (see src/reliability.js) used
  // to flag sites that have quietly gone bad (started CAPTCHA-walling,
  // redirecting to a login page, etc.) across several runs rather than
  // reacting to one noisy run. Persists across runs in Docker/local as long
  // as ./logs is a real (not ephemeral) directory; in GitHub Actions it's
  // restored/saved via actions/cache in the workflow, since each run starts
  // from a fresh checkout otherwise.
  reliability: {
    ledgerPath: path.join(__dirname, '..', 'logs', 'site-history.json'),
  },
};

function pickKeyword(index) {
  return settings.keywords[index % settings.keywords.length];
}

function pickTargetUrl(runSettings) {
  const urls = runSettings.targetUrls;
  return urls[Math.floor(Math.random() * urls.length)];
}

module.exports = { settings, pickKeyword, pickTargetUrl };
