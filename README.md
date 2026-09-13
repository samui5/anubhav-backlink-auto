# automate-backlink

Submits one of several `anubhavtrainings.com` pages (and the YouTube
channel), picked at random per attempt (config/settings.js), to a list of
free ping / backlink tools (config/sites.js), driving up to five browser
engines — Chrome, Edge, Playwright's bundled Chromium, Firefox, and Opera —
in parallel (see src/browsers.js). Each engine works through the site list
on its own, so all of them run at the same time. Writes a JSON and an HTML
log report to `logs/` when done, and (see "Off-page automation extras"
below) also: pulls fresh URLs from the site's sitemap and the YouTube
channel's own upload feed every run instead of a static list, cross-posts
new content to Dev.to/Hashnode with a canonical link back, optionally
shares to X/LinkedIn/Facebook via their official APIs, and tracks each
site's success rate over time to flag ones that have quietly gone bad.

**No CAPTCHA policy**: any site confirmed to sit behind a CAPTCHA or bot
wall (reCAPTCHA, hCaptcha, Cloudflare, etc) is not kept in this project at
all — its entry is deleted outright rather than worked around or paused on.
See "CAPTCHA/bot-wall sites removed" below for the current exclusion list.

## Setup

```
npm install
```

`npm install` runs `playwright install chromium firefox` automatically
(Chrome is launched via your real installed Chrome, Firefox via Playwright's
bundled build). Opera is launched from its real install path — auto-detected
from the usual Windows/Linux locations; if yours is elsewhere, set
`OPERA_PATH`:

```
set OPERA_PATH=C:\path\to\opera.exe
```

## Run

```
npm start
```

Useful flags for testing without doing a full run across every site and browser:

```
node index.js --only=chrome --limit=3
node index.js --headless
```

- `--only=chrome,edge,chromium,firefox,opera` — run a subset of engines
- `--limit=5` — only process the first N sites
- `--headless` — no visible windows. `pauseOnCaptcha` is automatically
  forced off in this mode (there's no window for a human to solve anything
  in), so any CAPTCHA just gets logged as `skipped-captcha` immediately.

Two env vars override `config/settings.js` without editing it — handy for
Docker/CI (see below) or a quick one-off run:

- `TARGET_URLS` — comma-separated links; one is picked at random per site
  attempt. Leave unset to use the built-in default list in
  `config/settings.js`.
- `TARGET_URL` — forces every submission to this one single link instead
  (overrides `TARGET_URLS`).
- `PING_KEYWORDS` — comma-separated keywords, rotated one per site.

## Off-page automation extras

Eight ideas for extending off-page SEO beyond the ping/backlink site list,
implemented 2026-09-13. Discovery and reliability tracking are on by
default and need no setup; everything else is independently a no-op until
you add its own credentials as env vars (locally/Docker) or repo secrets
(GitHub Actions — already wired into every `.github/workflows/*.yml`).

| # | Idea | Module | Needs |
|---|---|---|---|
| 1 | Sitemap-driven URL discovery | `src/discovery.js` | nothing — on by default |
| 2 | Per-video targeting | `src/discovery.js` | nothing — on by default |
| 3 | Site reliability tracking | `src/reliability.js` | nothing — on by default |
| 4/5 | Directories / profile backlinks | `config/directories.js` | see below — currently empty |
| 6 | Blog syndication (Dev.to/Hashnode) | `src/syndication.js` | `DEVTO_API_KEY` and/or `HASHNODE_TOKEN`+`HASHNODE_PUBLICATION_ID` |
| 7 | Video-recap syndication | `src/syndication.js` + `src/transcripts.js` | the above, plus `ANTHROPIC_API_KEY` |
| 8 | Social sharing | `src/social.js` | `TWITTER_BEARER_TOKEN` / `LINKEDIN_ACCESS_TOKEN`+`LINKEDIN_ACTOR_URN` / `FACEBOOK_PAGE_ACCESS_TOKEN`+`FACEBOOK_PAGE_ID` |

### 1/2. Sitemap + YouTube discovery

`src/discovery.js` fetches `config/settings.js`'s `discovery.sitemapUrl`
(default: `anubhavtrainings.com/sitemap.xml`, handles a plain `<urlset>` or
a `<sitemapindex>` of child sitemaps) and the public Atom feed for
`discovery.youtubeChannelUrl` (`https://www.youtube.com/feeds/videos.xml?channel_id=...`
— resolves an `@handle`/`/c/`/`/user/` URL to its `UC...` channel ID first;
no YouTube Data API key needed for any of this). Both lists get merged into
the target-URL pool `pickTargetUrl()` draws from for that run — a new blog
post or video is in the rotation automatically, no `config/settings.js`
edit required. Fully best-effort: a broken sitemap or an unresolvable
channel handle just logs a warning and contributes nothing that run, it
never fails the run. Override via `DISCOVERY_ENABLED=false`, `SITEMAP_URL`,
`MAX_SITEMAP_URLS`, `YOUTUBE_CHANNEL_URL`, `MAX_YOUTUBE_URLS`.

### 3. Site reliability tracking

`src/reliability.js` appends every attempt from every run into
`logs/site-history.json` (capped to the most recent 20 attempts per site),
then reports each site's rolling success rate and flags any with a rate
under 50% across at least 4 attempts — the report's "Site reliability"
section. This is what turns "one bad run" into "this site has actually
gone bad" (started CAPTCHA-walling automated traffic, redirecting to a
login page, etc. — exactly the two failure modes found live while
researching the current site list, see `config/sites.js`'s own comments).
Needs `logs/` to actually persist across runs to be useful: on GitHub
Actions each run starts from a fresh checkout, so every workflow restores
this file (and the syndication ledger) via `actions/cache` before the run
and saves it back after — see the "Restore/Save reliability + syndication
ledgers" steps. Locally/Docker it's just a file on disk; mount `./logs` as
a volume (`docker run -v $(pwd)/logs:/app/logs ...`) if you want it to
survive between container runs there too.

### 4/5. Directories and profile/bio backlinks — currently empty, by design

`config/directories.js` exists (with the same richer `ctx.business`
plumbing as `config/sites.js`'s `ctx`, wired in `src/worker.js`) but ships
empty. Real research into free, instant, no-signup business/training
directories (2026-09-13) hit three consistent walls instead of viable
candidates — see the comment at the top of that file for the specific
sites tried:

- **Paywalled**: looks like a plain form, but the "free" submission
  redirects to a payment page before anything actually gets listed.
- **Signup-gated**: requires creating an account first, which itself
  requires verifying an email inbox — not something this codebase can do
  unattended.
- **Inappropriate to automate against**: a genuinely simple, captcha-free
  form on an official institutional site (a UN body's course catalog) —
  but that's a real request reviewed by real staff, not a disposable SEO
  tool, and this project's own safety tooling correctly refused a live
  test submission there for exactly that reason. Don't add
  `.gov`/`.un.org`/similar institutional intake forms here on the theory
  that nothing technical stops it.

If you find a genuine free/instant/no-signup directory later, it's a
plain object in `config/directories.js` with the same shape as a
`config/sites.js` entry, plus access to `ctx.business.{name,category,
description,email}` (from `config/settings.js`'s `business` block —
`BUSINESS_NAME`/`BUSINESS_CATEGORY`/`BUSINESS_DESCRIPTION`/`BUSINESS_EMAIL`
env vars).

### 6/7. Content syndication (Dev.to / Hashnode)

`src/syndication.js` cross-posts real content via each platform's official
API — never browser/form automation, unlike `config/sites.js` — with a
`canonical_url` pointing back at the original so search engines credit the
source instead of flagging duplicate content:

- **Idea 6 (blog posts)**: each run, up to 2 sitemap pages not yet
  syndicated (tracked in `logs/syndicated.json`) are loaded in a headless
  browser, their readable text extracted, and posted as-is. Needs no LLM
  and always works once a platform is configured.
- **Idea 7 (video recaps)**: up to 1 not-yet-syndicated video per run has
  its caption track fetched (`src/transcripts.js` — a reverse-engineered
  scrape of the same data YouTube's own player uses, since there's no
  public API for this; inherently fragile, and **as of 2026-09-13 YouTube's
  legacy caption endpoint is returning empty responses for
  auto-generated/"asr" tracks specifically** — so this will often skip
  right now until either that changes or it's replaced with a proper
  YouTube Data API `captions.download` call, which needs OAuth as the
  channel owner) and, if that succeeds, summarized into a ~300-word recap
  by the Claude API. Skipped gracefully (never an error) whenever a
  transcript isn't available or `ANTHROPIC_API_KEY` isn't set.

Setup:

- **Dev.to**: generate an API key at
  <https://dev.to/settings/extensions> ("DEV API Keys") and set
  `DEVTO_API_KEY`. Verified live against the real API in this project
  (a deliberately-invalid key correctly got a clean `401`) — the endpoint
  and payload shape are confirmed correct.
- **Hashnode**: generate a Personal Access Token at
  <https://hashnode.com/settings/developer>, find your publication ID from
  your blog dashboard's URL, and set `HASHNODE_TOKEN` +
  `HASHNODE_PUBLICATION_ID`. **Unverified** — no token was available to
  test against the live API, so `postToHashnode()` matches Hashnode's
  documented GraphQL schema at the time this was written but hasn't
  actually been exercised; sanity-check your first real post.
- **Claude API** (video recaps only): create a key at
  <https://console.anthropic.com/settings/keys> and set
  `ANTHROPIC_API_KEY`.

### 8. Social sharing

`src/social.js` shares this run's picked target link to X/LinkedIn/Facebook
via their official REST APIs — deliberately not Playwright/form automation
(logging into a personal or company social account and clicking through a
compose box is exactly what these platforms' bot-detection is built to
catch, far more aggressively than a free SEO ping tool, and a flagged
social account is a much worse outcome than one failed ping). Each
platform requires creating a developer app on that platform — something
this codebase can't do for you:

- **X/Twitter**: create a project + app at
  <https://developer.x.com>, generate a **user-context** OAuth 2.0 token
  with `tweet.write` scope (an app-only/read-only bearer token cannot
  post), set `TWITTER_BEARER_TOKEN`. Posting is on X's paid API tiers as of
  2026.
- **LinkedIn**: create an app at
  <https://www.linkedin.com/developers/apps>, request the "Share on
  LinkedIn" product (needs review/approval), generate an access token with
  `w_member_social` (or `w_organization_social`) scope, set
  `LINKEDIN_ACCESS_TOKEN` and `LINKEDIN_ACTOR_URN` (e.g.
  `urn:li:person:xxxx` or `urn:li:organization:xxxx`).
- **Facebook**: create an app at <https://developers.facebook.com/apps>,
  get a long-lived Page Access Token for your Page via Graph API Explorer,
  set `FACEBOOK_PAGE_ACCESS_TOKEN` and `FACEBOOK_PAGE_ID`.

None of the three above were exercised against a live account (no
developer apps were available to test with) — the request shapes match
each platform's official documented API, but treat the first real run as a
sanity check, same as Hashnode.

## Docker

A `Dockerfile` builds a single image with Chrome, Edge, Playwright's
bundled Chromium, Firefox, and Opera all installed, driven fully headlessly
(there's no display in a container, so `--headless` is baked into the
entrypoint regardless of `config/settings.js`'s local-use default):

```
docker build -t automate-backlink .
docker run --rm automate-backlink
docker run --rm automate-backlink --only=chrome,edge,chromium,firefox --limit=5
docker run --rm -e TARGET_URL=https://example.com automate-backlink
```

Chrome and Firefox were both verified by actually building and running
this image — cleanly and reliably. Opera showed intermittent crash-loop
behavior a few seconds into headless startup during that testing (Docker
Desktop on Windows, WSL2 backend) — see the comment above the Opera install
step in the `Dockerfile` and the big comment in `src/browsers.js` for the
full story (a real bug was found and fixed there: Opera's Chromium base
doesn't support Playwright's newer pipe-based CDP transport, so it's
launched as a raw process and attached to over the classic HTTP/WebSocket
transport instead — but a second, harder-to-pin-down stability issue
remains, retried a few times per launch). This isn't specific to nested
virtualization: the exact same "DevTools port never opens" failure also
showed up on an actual GitHub Actions runner (see below) — if Opera is
unreliable in your environment too, run with `--only=chrome,edge,chromium,firefox`.
Edge and Chromium are new additions here and haven't been build-tested in
this Docker image yet the way Chrome/Firefox/Opera were — sanity-check
your first run.

To pull the target links/keywords from outside the image without a
rebuild, either pass `-e TARGET_URLS=... -e PING_KEYWORDS=...`
(comma-separated) to `docker run`, or bake different defaults in by
editing `config/settings.js` before `docker build`.

## GitHub Actions (free CI runner)

`.github/workflows/automate-backlink.yml` runs the automation on
`ubuntu-latest` — a GitHub-hosted runner that's free with no minute limit on
a public repo. It installs Node, Chrome, Edge, and Playwright's own
Chromium/Firefox from scratch on the runner each time (same steps as the
Dockerfile, just via `apt`/`npx` instead of `RUN`), executes the run, and
uploads the JSON/HTML report from `logs/` as a downloadable workflow
artifact.

**Opera is skipped here**: confirmed in an actual run on this runner to
fail every launch (`Opera never opened its DevTools port in time`) — the
same failure mode already seen testing under Docker Desktop/WSL2 (see the
Dockerfile and `src/browsers.js`). Both the manual-dispatch default and the
scheduled run use `--only=chrome,edge,chromium,firefox`; pass `opera` in
the `browsers` input on a manual run if you want to try it anyway (expect
it to fail).

Push it to your repo, then either use the **Run workflow** button on the
Actions tab (inputs let you override the target URL, keywords, browser
subset, and site limit for that one run without editing anything) or just
wait — it also runs automatically on the `schedule:` cron (daily at 02:00
IST / 20:30 UTC by default; edit the cron expression in the workflow file
to change it).

### Per-country workflows (free proxies)

`.github/workflows/automate-backlink-{usa,australia,canada,germany,singapore}.yml`
are otherwise-identical copies of the base workflow above (this one is left
completely untouched), each setting one extra env var —
`PROXY_COUNTRY: US` / `AU` / `CA` / `DE` / `SG` — which routes every browser
engine for that run through a free public proxy in that country (see
"Free proxies" below). Manual-trigger only (`workflow_dispatch`), no
automatic schedule — add your own `schedule:` cron to a copy if you want
one recurring.

Each writes its own artifact (`backlink-run-report-usa`, etc.) and, if
`GMAIL_APP_PASSWORD` is set, tags its email subject with the country
(`[US] Backlink automation report — ...`) so five runs' worth of reports
stay easy to tell apart in an inbox.

### Free proxies

`src/proxy.js` pulls free public proxy candidates for a country from two
independent sources (geonode, proxyscrape), verifies each one is actually
reachable (a real HTTPS request through it) before trusting it, and hands
the first working one to whichever browser engines run — set via the
`PROXY_COUNTRY` env var (`US`, `AU`, `CA`, `DE`, or `SG`; the per-country
workflows above set this for you).

Worth being clear-eyed about since "free proxy" undersells how unreliable
these are: most candidates in any given fetch are already dead, and a
notable fraction of the ones that *do* respond may log or tamper with
traffic — never route anything sensitive through one. This project only
ever uses them to vary the apparent source country of outbound ping/backlink
form submissions, nothing involving credentials. If every candidate for a
country fails (which happens — it's normal, not a bug), the run **proceeds
without a proxy** rather than failing outright; check the run's console
output / report for `Proxy: none reachable for <CC> — running direct`.
For anything that actually needs to work reliably, a small paid rotating
proxy service (Bright Data, Webshare, etc.) is the trustworthy version of
this same idea.

## Email report

Every run — local, Docker, GitHub Actions, or the GCP scheduled timer —
emails the finished HTML + JSON report as attachments (plus a plain-text
summary in the body) once it completes, success or failure. Sent via
Gmail SMTP with an App Password, from `wednesday.ui5@gmail.com` to
`anubhav.abap@gmail.com` by default (`config/settings.js` -> `email`,
sent in `src/mailer.js`).

To enable it, set one env var:

- `GMAIL_APP_PASSWORD` — generate at
  <https://myaccount.google.com/apppasswords> for the *sending* account
  (`wednesday.ui5@gmail.com`), which requires 2-Step Verification to be
  turned on for that account first.

Leaving it unset just skips the email (logged, not fatal) — nothing else
breaks. Optional overrides: `EMAIL_FROM`, `EMAIL_TO`,
`SEND_REPORT_EMAIL=false` to disable outright.

- **Local / Docker**: export it before running, or add it to the
  `--env-file` passed to `docker run`.
- **GitHub Actions**: add it as a repo secret named `GMAIL_APP_PASSWORD`
  (Settings → Secrets and variables → Actions) — already wired into
  `.github/workflows/automate-backlink.yml`.
- **GCP VM**: deliberately *not* passed through instance metadata (visible
  to anyone with project-viewer access) — SSH in after first boot and add
  it by hand to `/etc/automate-backlink.env`:
  ```
  gcloud compute ssh automate-backlink --zone=us-central1-a \
    --command='sudo nano /etc/automate-backlink.env'
  ```
  No restart needed; it's read fresh on the next scheduled run.

## Deploy to GCP (Always Free e2-micro)

`deploy/gcp-create-instance.sh` provisions a GCP `e2-micro` VM — Google's
Always Free tier covers exactly **one** of these per month, only in
`us-west1`, `us-central1`, or `us-east1` (this defaults to
`us-central1-a`), plus up to 30GB-month of standard persistent disk and
1GB/day of North-America egress. Staying within that (the default here)
costs nothing; a project with billing enabled is still required to create
any VM, it just won't be charged.

The instance is fully self-configuring via `deploy/startup-script.sh`,
which runs automatically on boot: installs Docker, clones this repo,
builds the image, and registers a `systemd` timer that runs it on a
recurring schedule — no manual setup on the VM itself.

```
# Push this repo to GitHub first (or any git host the VM can clone from),
# then:
REPO_URL=https://github.com/<you>/automate-backlink.git \
  ./deploy/gcp-create-instance.sh
```

Both scripts pass `shellcheck` clean, but the GCP provisioning itself
hasn't been run against a real project in this environment (no GCP
credentials available here) — the Docker and GitHub Actions setups above
*were* both actually built/run and verified; treat this one as
carefully-written-but-not-live-tested and sanity-check the first run.

Other env vars `gcp-create-instance.sh` accepts (all optional): `ZONE`,
`INSTANCE_NAME`, `REPO_BRANCH`, `TARGET_URLS` (comma-separated; leave
unset for the built-in default list), `PING_KEYWORDS`,
`RUN_SCHEDULE` (a systemd `OnCalendar` expression — default `daily`), and
`RUN_BROWSERS` (default `chrome,firefox`). **Opera is left out by default**
here specifically: e2-micro only has 1GB RAM, and Opera has shown
intermittent crash-loop behavior under constrained/virtualized Docker
environments in this project's own testing (see the Dockerfile and
`src/browsers.js`) — Chrome and Firefox are the two verified reliable in
Docker. The startup-script also adds a 2GB swapfile as a safety margin for
the Docker build and the browsers themselves.

Useful commands once it's up (see the full list the create script prints):

```
# Watch first-boot setup
gcloud compute ssh automate-backlink --zone=us-central1-a \
  --command='sudo journalctl -u google-startup-scripts -f'

# Watch a run
gcloud compute ssh automate-backlink --zone=us-central1-a \
  --command='sudo journalctl -u automate-backlink -f'

# Pull reports back to your machine
gcloud compute scp --zone=us-central1-a --recurse \
  automate-backlink:/opt/automate-backlink/logs ./gcp-logs
```

To change the target links / keywords later without recreating the VM: SSH
in, edit `/etc/automate-backlink.env`, and wait for the next scheduled
tick (no restart needed — it's read fresh every run). To change the
schedule: edit `/etc/systemd/system/automate-backlink.timer`, then
`sudo systemctl daemon-reload && sudo systemctl restart automate-backlink.timer`.

`deploy/gcp-teardown.sh` deletes the instance (asks for confirmation
first) — there's no cost reason to do this while within the free-tier
limits, it's just there for whenever you're done with it.

## How it works

- **config/settings.js** — the target link list (one picked at random per
  site attempt: the homepage plus a few specific pages/channel — see
  `targetUrls` — merged at runtime with whatever `src/discovery.js` finds,
  see "Off-page automation extras" above), the keyword list (rotated one
  per site), and run options (headless, timeouts, 20-second post-submit
  wait, CAPTCHA behavior).
- **config/sites.js** — the deduplicated site list (23 sites, all hand-
  verified with a real `run()` — see "Site list" below; no more generic-
  heuristic entries as of the 2026-09-13 cleanup).
- **config/directories.js** — richer directory/profile-style entries (Idea
  4/5); currently empty, see "Off-page automation extras" above for why.
- **src/worker.js** — for one browser engine, loops through every site
  serially: navigate, dismiss any cookie-consent banner and any other
  popup/modal, detect a real on-screen CAPTCHA, run the site's `run()`,
  record the result.
- **src/engine.js**:
  - `dismissCookieBanners` — fresh Playwright profiles have no
    accepted-cookies state, so consent banners (OneTrust, Cookiebot, etc.)
    render on first visit and can physically overlay the form. This
    best-effort-dismisses them before anything else touches the page.
  - `dismissPopups` — the same idea for newsletter/login/exit-intent
    modals, which are a different problem than a cookie banner (found live
    on a site that stacked a login modal AND a Mailchimp signup modal on
    top of its own ping form): tries Escape, known/likely close buttons,
    common "no thanks"-style wording, then as a last resort hides any
    still-visible full-screen dialog/backdrop directly.
  - `detectCaptcha` — checks for a CAPTCHA/bot-wall challenge that is
    actually rendered on screen. Deliberately does **not** treat the
    `g-recaptcha`/`h-captcha` CSS class alone as a signal: several sites put
    that class directly on their ordinary, always-visible submit button
    (that's how Google's "invisible" reCAPTCHA is wired up), so the class's
    mere presence doesn't mean a challenge is showing — only its iframe
    actually appearing on screen does. Note this only catches the
    iframe/interstitial kind — a plain required "verify this number"
    text field with no iframe (found live on one researched candidate) has
    to be caught by hand and the site dropped, not automated around.
  - `typeLikeHuman` — some sites' JS frameworks only react to real keystroke
    events, not Playwright's `.fill()` (which sets the value directly and
    fires only a synthetic `input` event) — so every site types character by
    character instead.
  - `genericSubmit` — a heuristic fallback kept for any future unverified
    entry; nothing in the current site list uses it.
- **src/discovery.js / src/reliability.js / src/syndication.js /
  src/transcripts.js / src/social.js** — the off-page automation extras;
  see that section above for what each does.
- **src/logger.js / src/report.js / src/mailer.js** — collect every
  attempt plus the extras' results and write `logs/run-<timestamp>.json` /
  `.html` (and the emailed summary) with per-status, per-browser, discovery,
  reliability, syndication, and social-sharing sections.

## Site list

Started from two URL lists provided over the course of building this
project (27 ping/backlink tools, then 54 more legacy ping directories,
peaking at 56 total), with duplicates removed by normalized host+path. Two
cleanup passes since then, each backed by a real headless test run rather
than guesswork, landed on the current 23:

- **2026-09-12**: 4 sites removed for having a CAPTCHA, 4 CAPTCHA-free
  replacements added (see "CAPTCHA-free replacements added" below).
- **2026-09-13, pass 1**: the entire 38-site "legacy ping directory" block
  (2005-2010 era) removed after a live run showed 36/38 dead (no DNS
  resolution, or a bare XML-RPC endpoint with no browser-facing form) — the
  2 genuine survivors were promoted with real selectors, one of which
  (FeedShark) turned out to have an undetected CAPTCHA-equivalent (a
  required plain-number "verify" field, no iframe) and was dropped too. 4
  more long-standing entries turned out to be dead/parked/not-actually-a-
  backlink-form and were removed. 28 new sites were researched and added,
  each individually confirmed live (real submission, real success
  response, zero CAPTCHA) — see `config/sites.js`'s own top-of-file comment
  for the full rejected-candidate list.
- **2026-09-13, pass 2**: a live `workflow_dispatch` run on GitHub's
  `ubuntu-latest` runners exposed that several of pass 1's new sites —
  all individually verified from a residential IP — are behind
  datacenter/cloud-IP-specific bot detection invisible from home but very
  real in CI: 17 came back CAPTCHA-walled or stuck in a self-redirect loop
  on every single browser there. All were removed. A second live run on
  the pruned 24-site list then measured a genuine **93.8% success rate**;
  one more site that came back flaky across two separate runs (3/8
  combined) was removed after that, landing on the current 23.

Re-run `node index.js --headless` any time to get a fresh count against
this list; the rolling site-reliability tracker (`src/reliability.js`, see
above) is specifically there to catch the next site that quietly goes bad
the same way, across runs rather than reacting to one noisy one.

### CAPTCHA/bot-wall sites removed

These were tried, confirmed to sit behind a CAPTCHA or bot wall, and deleted
from `config/sites.js` entirely per the no-CAPTCHA policy — they are not
referenced anywhere in the code:

| Site | Reason |
|---|---|
| SmallSEOTools Ping Website Tool | Google reCAPTCHA renders a real image challenge for automated browsers (confirmed visually) |
| Pingler | Same — reCAPTCHA bound directly to its "Ping!" button |
| SearchEngineReports Ping Tool | Cloudflare "Attention Required" interstitial |
| DupliChecker Ping Tool | Cloudflare "Attention Required" interstitial (triggers specifically under headless automation) |

If you want one of these back despite the CAPTCHA, you'd need to run headed
with `pauseOnCaptcha: true` (the default) and solve it by hand each time —
the code for that (`ctx.checkCaptcha()`/`ctx.clickAndHandleCaptcha()`) is
still in `src/engine.js`, just no longer wired to any site.

### CAPTCHA-free replacements added

Sourced by web research and confirmed live (real form filled, real "Thanks
for the ping." / "OK" success response, no CAPTCHA of any kind) — one for
one against the four removed above:

| Site | URL |
|---|---|
| Naklov Online Ping Website Tool | naklov.com/en/seo-tools/online-ping-website-tool |
| SEOQueen Online Ping Website Tool | seoqueen.com/seo-tools/online-ping-website-tool |
| MassPingTool | masspingtool.com |
| WMTools Mass Ping | wmtools.me/mass-ping |

A few other researched candidates were rejected after live-checking rather
than added on faith: onwardSEO's ping tool never finishes loading (broken
widget), SEOToolspark and HostNamaste use the exact same underlying template
as Naklov/SEOQueen but have a reCAPTCHA / image CAPTCHA bolted on, and
MegriTools' submit button hangs forever (also broken — and its own page copy
has stray leftover AI-assistant text, a sign of low-effort AI-generated
content not worth trusting further).

## Known limitations

- "submitted" in the report means the form was filled and the submit action
  was clicked, not that the third-party service confirmed indexing — most
  of these tools don't give a reliable machine-readable success signal
  (SmallSEOTools' verified `run()` is the exception: it explicitly checks
  for "success" rows before reporting submitted — moot now since that site
  was removed, but the pattern is there in git history if a similar site
  gets added back).
- The generic heuristic engine can't tell a real ping form from an
  unrelated one on the same page (e.g. a newsletter signup with its own
  "email" field) — if a `failed`/wrong-field report keeps happening for a
  specific site, add a hand-written `run()` for it instead of relying on
  the heuristic.
- **PhantomJS is not supported and won't be added**: it's unmaintained
  since 2018, isn't a Playwright-drivable engine at all (Playwright only
  automates Chromium, Firefox, and WebKit), and its ancient bundled WebKit
  fails modern TLS/JS on most live sites anyway — it wouldn't reliably
  submit to any of these tools even if wired up through a separate
  automation stack.
