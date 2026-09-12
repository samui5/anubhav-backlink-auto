const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Free public proxy lists, filtered by country. These are exactly what
// they sound like — unauthenticated, unowned, and unreliable: most entries
// in any given fetch are already dead, a few log or tamper with traffic,
// and none of this is meant for anything sensitive. It's used here only to
// vary the apparent source country of outbound ping/backlink submissions,
// never for credentials or anything private. Two independent sources are
// queried and merged so one being down doesn't leave zero candidates; every
// candidate is verified reachable (a real HTTPS request through it) before
// it's ever handed to a browser, and if every candidate fails, the run
// proceeds without a proxy rather than failing outright — see
// findWorkingProxy below.

const COUNTRY_ALIASES = {
  usa: 'US',
  us: 'US',
  'united states': 'US',
  australia: 'AU',
  au: 'AU',
  canada: 'CA',
  ca: 'CA',
  germany: 'DE',
  de: 'DE',
  singapore: 'SG',
  sg: 'SG',
};

function normalizeCountry(input) {
  const key = String(input || '').trim().toLowerCase();
  return COUNTRY_ALIASES[key] || String(input || '').trim().toUpperCase();
}

async function fetchJson(url, timeoutMs) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchText(url, timeoutMs) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Richer source: includes protocol/uptime info, sorted so more recently
// checked (and so more likely still alive) proxies come first.
async function fromGeonode(countryCode) {
  const url =
    `https://proxylist.geonode.com/api/proxy-list?country=${encodeURIComponent(countryCode)}` +
    '&limit=25&page=1&sort_by=lastChecked&sort_type=desc&protocols=http,https';
  const body = await fetchJson(url, 10000);
  return (body.data || []).map((p) => `${p.ip}:${p.port}`);
}

// Simpler plain-text source, kept as a second independent supply so one
// API being down/rate-limited doesn't leave the country with no candidates.
async function fromProxyscrape(countryCode) {
  const url =
    'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http' +
    `&timeout=10000&country=${encodeURIComponent(countryCode)}&ssl=all&anonymity=all`;
  const body = await fetchText(url, 10000);
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function candidateProxies(countryCode) {
  const [geonode, proxyscrape] = await Promise.allSettled([
    fromGeonode(countryCode),
    fromProxyscrape(countryCode),
  ]);
  const combined = [
    ...(geonode.status === 'fulfilled' ? geonode.value : []),
    ...(proxyscrape.status === 'fulfilled' ? proxyscrape.value : []),
  ];
  return [...new Set(combined)];
}

// True if a real HTTPS request completes through this proxy within the
// timeout. This is the only trustworthy signal for a free proxy list —
// most entries are already dead by the time you read them.
function testProxy(hostPort, timeoutMs) {
  return new Promise((resolve) => {
    let agent;
    try {
      agent = new HttpsProxyAgent(`http://${hostPort}`, { timeout: timeoutMs });
    } catch {
      resolve(false);
      return;
    }
    const req = https.get(
      'https://api.ipify.org/?format=json',
      { agent, timeout: timeoutMs },
      (res) => {
        res.resume(); // drain, we only care that it responded 200
        resolve(res.statusCode === 200);
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(false));
  });
}

// Fetches candidate proxies for the given country, verifies them
// concurrently, and returns the first one that actually works — or null if
// none did (every candidate list from a free source can be entirely dead at
// any given moment; that's expected, not a bug). Never throws.
async function findWorkingProxy(countryInput, { maxCandidates = 15, perProxyTimeoutMs = 6000 } = {}) {
  const countryCode = normalizeCountry(countryInput);

  let candidates;
  try {
    candidates = await candidateProxies(countryCode);
  } catch {
    candidates = [];
  }

  if (candidates.length === 0) {
    console.warn(`[proxy] No free proxy candidates returned for country "${countryCode}".`);
    return null;
  }

  const toTry = candidates.slice(0, maxCandidates);
  console.log(`[proxy] Testing ${toTry.length} free ${countryCode} proxy candidate(s)...`);

  const winner = await new Promise((resolve) => {
    let remaining = toTry.length;
    let settled = false;
    for (const hostPort of toTry) {
      testProxy(hostPort, perProxyTimeoutMs).then((ok) => {
        if (settled) return;
        if (ok) {
          settled = true;
          resolve(hostPort);
        } else if (--remaining === 0) {
          settled = true;
          resolve(null);
        }
      });
    }
  });

  if (winner) {
    console.log(`[proxy] Using free ${countryCode} proxy ${winner} (verified reachable).`);
    return { server: `http://${winner}`, country: countryCode, hostPort: winner };
  }

  console.warn(
    `[proxy] None of ${toTry.length} candidate ${countryCode} proxies responded — continuing without a proxy.`
  );
  return null;
}

module.exports = { findWorkingProxy, normalizeCountry };
