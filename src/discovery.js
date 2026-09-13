// Pulls fresh target URLs at the start of a run instead of only ever
// hitting the static config/settings.js list: a page listed in the site's
// sitemap.xml, and a video from the YouTube channel's public upload feed
// (Idea #1/#2 — sitemap + per-video targeting). Both are best-effort and
// read-only network calls with no API key — a sitemap XML fetch and a
// public Atom feed fetch respectively — so there's nothing to authenticate
// and nothing here can fail the run: every function below reports errors
// in its return value rather than throwing.

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; automate-backlink/1.0)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
}

// Handles both a plain <urlset> (a list of pages) and a <sitemapindex> (a
// list of child sitemaps, common on larger sites) — in the index case, the
// first few child sitemaps are fetched and merged rather than returning the
// sitemap URLs themselves as if they were pages.
async function fetchSitemapUrls(sitemapUrl, maxUrls) {
  if (!sitemapUrl) return { urls: [], error: null };
  try {
    const xml = await fetchText(sitemapUrl);
    const isIndex = /<sitemapindex[\s>]/i.test(xml);
    let locs = extractLocs(xml);
    if (isIndex) {
      const childSitemaps = locs.slice(0, 3);
      const merged = [];
      for (const child of childSitemaps) {
        const childXml = await fetchText(child).catch(() => '');
        merged.push(...extractLocs(childXml));
        if (merged.length >= maxUrls) break;
      }
      locs = merged;
    }
    return { urls: locs.slice(0, maxUrls), error: null };
  } catch (err) {
    return { urls: [], error: err.message };
  }
}

// Resolves a channel URL (any of /@handle, /channel/UC..., /c/name,
// /user/name) to its canonical UC... channel ID, which is what the public
// RSS feed endpoint needs. /channel/UC... URLs short-circuit without a
// fetch; everything else needs one page load to read the ID out of the
// page's own metadata.
async function resolveYoutubeChannelId(channelUrl) {
  const directMatch = /\/channel\/(UC[A-Za-z0-9_-]+)/.exec(channelUrl);
  if (directMatch) return directMatch[1];

  const html = await fetchText(channelUrl);
  const match =
    /"channelId":"(UC[A-Za-z0-9_-]+)"/.exec(html) ||
    /"externalId":"(UC[A-Za-z0-9_-]+)"/.exec(html) ||
    /channel_id=(UC[A-Za-z0-9_-]+)/.exec(html);
  if (!match) throw new Error('could not find a channelId on the channel page');
  return match[1];
}

function extractYoutubeVideos(feedXml) {
  const entries = [...feedXml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  return entries
    .map((entry) => {
      const idMatch = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(entry);
      if (!idMatch) return null;
      const titleMatch = /<title>([^<]*)<\/title>/.exec(entry);
      const publishedMatch = /<published>([^<]*)<\/published>/.exec(entry);
      return {
        id: idMatch[1],
        title: titleMatch ? titleMatch[1] : '',
        published: publishedMatch ? publishedMatch[1] : null,
        url: `https://www.youtube.com/watch?v=${idMatch[1]}`,
      };
    })
    .filter(Boolean);
}

async function fetchYoutubeVideos(channelUrl, maxVideos) {
  if (!channelUrl) return { videos: [], error: null };
  try {
    const channelId = await resolveYoutubeChannelId(channelUrl);
    const feedXml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    const videos = extractYoutubeVideos(feedXml).slice(0, maxVideos);
    return { videos, channelId, error: null };
  } catch (err) {
    return { videos: [], error: err.message };
  }
}

// Runs both discovery sources and returns everything the caller needs to
// both extend the target-URL pool for this run and populate the report.
async function discoverTargets(settings) {
  const result = { sitemapUrls: [], videos: [], errors: [] };
  if (!settings.discovery || !settings.discovery.enabled) return result;

  const [sitemap, youtube] = await Promise.all([
    fetchSitemapUrls(settings.discovery.sitemapUrl, settings.discovery.maxSitemapUrls),
    fetchYoutubeVideos(settings.discovery.youtubeChannelUrl, settings.discovery.maxYoutubeUrls),
  ]);

  result.sitemapUrls = sitemap.urls;
  if (sitemap.error) result.errors.push(`sitemap (${settings.discovery.sitemapUrl}): ${sitemap.error}`);

  result.videos = youtube.videos;
  if (youtube.error) result.errors.push(`youtube (${settings.discovery.youtubeChannelUrl}): ${youtube.error}`);

  return result;
}

module.exports = {
  discoverTargets,
  fetchSitemapUrls,
  fetchYoutubeVideos,
  resolveYoutubeChannelId,
};
