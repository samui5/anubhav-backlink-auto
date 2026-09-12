const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { chromium, firefox } = require('playwright');

function resolveOperaPath(settings) {
  for (const candidate of settings.operaExecutablePaths) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'Could not find an Opera executable. Set the OPERA_PATH env var to the ' +
      'full path of opera.exe (or opera on Linux).'
  );
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForCdpPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Opera never opened its DevTools port ${port} in time: ${lastErr?.message}`);
}

// Opera's Chromium build (135 at the time this was written) doesn't speak
// Playwright's newer pipe-based CDP transport — chromium.launch({
// executablePath }) fails with "Remote debugging pipe file descriptors are
// not open" specifically under Linux/headless (confirmed via a Docker test
// run; the classic pipe transport this relies on assumes a Chrome-matching
// startup handshake that Opera's older Chromium base doesn't implement).
// The older HTTP/WebSocket CDP transport still works fine, though, so Opera
// is spawned directly and Playwright attaches to it with connectOverCDP
// instead of launch().
//
// It's also been observed (under Docker Desktop on Windows/WSL2, in this
// project's own testing) to occasionally crash and restart a few seconds
// into headless startup — `--headless` (the older mode) was noticeably more
// stable for this than `--headless=new`, but not perfectly so. One retry
// with a fresh process is usually enough; this may be an artifact of
// nested virtualization rather than something that reproduces on a real
// Linux host or CI runner, but the retry costs little either way.
async function launchOperaOnce(settings) {
  const executablePath = resolveOperaPath(settings);
  const port = await getFreePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'automate-backlink-opera-'));

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    ...settings.chromiumArgs,
    ...(settings.headless ? ['--headless'] : []),
    'about:blank',
  ];

  const child = spawn(executablePath, args, { stdio: 'ignore' });
  child.on('error', () => {
    // Surfaced instead via the waitForCdpPort timeout / liveness probe below.
  });

  const cleanupProfile = () => {
    // Best-effort: the OS may still hold the directory open for a moment
    // right after the process exits (especially on Windows), and leftover
    // temp files here are harmless clutter, not a functional problem.
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  try {
    await waitForCdpPort(port, 15000);

    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { slowMo: settings.slowMoMs });
    const context = browser.contexts()[0] || (await browser.newContext());

    // Liveness probe: the port can answer /json/version and then the
    // process still die moments later (observed in testing). A real
    // navigation is a much stronger signal that it's actually stable.
    const probe = await context.newPage();
    await probe.goto('about:blank', { timeout: 5000 });
    await probe.close();

    const originalClose = browser.close.bind(browser);
    browser.close = async () => {
      try {
        await originalClose();
      } catch {
        // The browser process is about to be force-killed anyway.
      }
      if (!child.killed) child.kill();
      cleanupProfile();
    };

    return { browser, context };
  } catch (err) {
    if (!child.killed) child.kill();
    cleanupProfile();
    throw err;
  }
}

async function launchOperaViaCdp(settings, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await launchOperaOnce(settings);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Opera failed to start a stable session after ${attempts} attempts: ${lastErr?.message}`);
}

// Returns { browser, context } for the named engine. `browser` must be
// closed by the caller when done; `context` is a fresh browser context.
async function launch(name, settings) {
  const common = { headless: settings.headless, slowMo: settings.slowMoMs };

  if (name === 'chrome') {
    const browser = await chromium.launch({ ...common, channel: 'chrome', args: settings.chromiumArgs });
    const context = await browser.newContext();
    return { browser, context };
  }

  if (name === 'firefox') {
    const browser = await firefox.launch(common);
    const context = await browser.newContext();
    return { browser, context };
  }

  if (name === 'opera') {
    return launchOperaViaCdp(settings);
  }

  throw new Error(`Unknown browser "${name}". Expected chrome, firefox, or opera.`);
}

module.exports = { launch };
