# automate-backlink

Submits one of several `anubhavtrainings.com` pages (and the YouTube
channel), picked at random per attempt (config/settings.js), to a list of
free ping / backlink tools (config/sites.js), driving up to five browser
engines — Chrome, Edge, Playwright's bundled Chromium, Firefox, and Opera —
in parallel (see src/browsers.js). Each engine works through the site list
on its own, so all of them run at the same time. Writes a JSON and an HTML
log report to `logs/` when done.

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
  site attempt: the homepage plus five specific pages/channel — see
  `targetUrls`), the keyword list (rotated one per site: `sap btp training`,
  `sap cap training`, `sap rap training`, `sap gen ai course`), and run
  options (headless, timeouts, 20-second post-submit wait, CAPTCHA
  behavior).
- **config/sites.js** — the deduplicated site list (60 unique sites — see
  "Site list" below). Each entry is either:
  - **verified** — a hand-written `run()` using selectors confirmed against
    the live site on 2026-09-12 (Site24x7, Ping-O-Matic, PrepostSEO x2,
    PingMyLinks, Naklov, SEOQueen, MassPingTool, WMTools), or
  - **unverified** — no `run()`, so `src/engine.js`'s generic heuristic
    engine handles it: it looks for a URL-shaped input, an optional
    keyword-shaped input, and a submit-shaped button. These sites redesign
    their forms often (or, for the older ping directories, may no longer
    exist at all), so treat unverified results as best-effort — check the
    report for `failed` entries.
- **src/worker.js** — for one browser engine, loops through every site
  serially: navigate, dismiss any cookie-consent banner, detect a real
  on-screen CAPTCHA, run the site's `run()` (or the generic fallback),
  record the result.
- **src/engine.js**:
  - `dismissCookieBanners` — fresh Playwright profiles have no
    accepted-cookies state, so consent banners (OneTrust, Cookiebot, etc.)
    render on first visit and can physically overlay the form. This
    best-effort-dismisses them before anything else touches the page.
  - `detectCaptcha` — checks for a CAPTCHA/bot-wall challenge that is
    actually rendered on screen. Deliberately does **not** treat the
    `g-recaptcha`/`h-captcha` CSS class alone as a signal: several sites put
    that class directly on their ordinary, always-visible submit button
    (that's how Google's "invisible" reCAPTCHA is wired up), so the class's
    mere presence doesn't mean a challenge is showing — only its iframe
    actually appearing on screen does.
  - `typeLikeHuman` — some sites' JS frameworks only react to real keystroke
    events, not Playwright's `.fill()` (which sets the value directly and
    fires only a synthetic `input` event) — so every site types character by
    character instead.
  - `genericSubmit` — the heuristic fallback for unverified sites.
- **src/logger.js / src/report.js** — collect every attempt and write
  `logs/run-<timestamp>.json` and `.html` with per-status and per-browser
  summaries.

## Site list

Started from two URL lists provided over the course of building this
project (27 ping/backlink tools, then 54 more legacy ping directories), with
duplicates removed by normalized host+path, then 4 sites removed for having
a CAPTCHA and 4 CAPTCHA-free replacements researched and added in their
place (see below). A full headless test run against all 60 sites on
2026-09-12 gave:

- **16 submitted** — form found, filled, and its submit action fired.
- **44 failed** — mostly either a domain that no longer resolves (many of
  the 2005-2010-era ping directories are gone after 15-20 years) or a page
  that turned out to be a plain XML-RPC API endpoint
  (`weblogUpdates.ping`-style, meant for blogging software to call, not a
  browser) with no HTML form for the heuristic engine to find. Both surface
  honestly as `failed` — that's expected, not a bug. Re-run
  `node index.js --headless` any time to get a fresh count; some of these
  may come back online or change shape.
- **0 CAPTCHA hits** in that run, even with a broadened detector that also
  checks for Akamai/PerimeterX/Imperva/DataDome/Arkose/GeeTest signatures
  (not just reCAPTCHA/hCaptcha/Cloudflare).

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
