# automate-backlink — headless Chrome, Edge, Chromium, Firefox, and Opera
# in one image.
#
# Playwright's own Chromium/Firefox builds cover the "chromium" and
# "firefox" engines, but "chrome", "edge", and "opera" in this project
# drive the REAL Chrome/Edge/Opera browsers (see src/browsers.js), so all
# three get installed here via apt on top of the Playwright base image.
FROM node:22-bookworm

ENV DOCKER=true \
    NODE_ENV=production \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Base tools needed to add the Google Chrome and Opera apt repos below.
RUN apt-get update && apt-get install -y --no-install-recommends \
      wget gnupg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first so this layer is cached across code changes.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Playwright's bundled Chromium + Firefox, plus every OS-level library they
# need (fonts, codecs, etc.) — --with-deps installs those automatically.
RUN npx playwright install --with-deps chromium firefox

# Real Google Chrome, for the "chrome" engine (chromium.launch({channel:'chrome'})).
RUN wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get update \
    && apt-get install -y /tmp/chrome.deb \
    && rm /tmp/chrome.deb \
    && rm -rf /var/lib/apt/lists/*

# Real Microsoft Edge, for the "edge" engine. Unlike Opera below, Edge is a
# proper Playwright "channel" (chromium.launch({channel:'msedge'})) — no CDP
# workaround needed, same mechanism as the chrome channel above.
RUN wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-edge-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-edge-keyring.gpg] https://packages.microsoft.com/repos/edge stable main" \
       > /etc/apt/sources.list.d/microsoft-edge.list \
    && apt-get update \
    && apt-get install -y microsoft-edge-stable \
    && rm -rf /var/lib/apt/lists/*

# Real Opera, for the "opera" engine (launched via executablePath and
# attached to over the classic HTTP/WebSocket CDP transport, not
# chromium.launch() — see the big comment in src/browsers.js for why:
# Opera's Chromium base doesn't speak Playwright's newer pipe transport).
#
# NOTE ON RELIABILITY: confirmed unreliable both here (Docker Desktop on
# Windows/WSL2 — intermittent crash-loop a few seconds into headless
# startup) and on an actual GitHub Actions runner (DevTools port never
# opens) — Chrome, Edge, Playwright's bundled Chromium, and Firefox were all
# reliable in both environments. src/browsers.js retries a few times and
# verifies a real navigation (not just that the DevTools port answers)
# before trusting a session, but if Opera keeps failing for you too, drop it
# and run `--only=chrome,edge,chromium,firefox`.
RUN wget -qO- https://deb.opera.com/archive.key | gpg --dearmor -o /usr/share/keyrings/opera-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/opera-archive-keyring.gpg] https://deb.opera.com/opera-stable/ stable non-free" \
       > /etc/apt/sources.list.d/opera-stable.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends opera-stable \
    && rm -rf /var/lib/apt/lists/*

COPY . .

# There is no display in a container, so every engine always runs headless
# here regardless of config/settings.js's `headless` default (which is
# false, for local interactive use). --headless also forces
# pauseOnCaptcha off automatically (see index.js) since there's no window
# for a human to solve one in.
ENTRYPOINT ["node", "index.js", "--headless"]
CMD []
