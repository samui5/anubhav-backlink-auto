// Fetches a YouTube video's auto-generated (or uploaded) caption track with
// no API key — there isn't an official public endpoint for this, so this
// scrapes the same data the watch page's own player uses: the
// `captionTracks` list embedded in the page's ytInitialPlayerResponse JSON,
// then that track's timedtext URL. This is inherently a bit fragile (it's
// reverse-engineered, not a documented API — YouTube can change the page
// structure at any time), so every caller treats a failure here as
// "no transcript available this run" rather than something to retry or
// escalate: src/syndication.js just skips the recap-post step for that
// video.

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

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function pickCaptionTrack(tracks) {
  if (!tracks || !tracks.length) return null;
  return (
    tracks.find((t) => t.languageCode === 'en' && t.kind !== 'asr') ||
    tracks.find((t) => t.languageCode === 'en') ||
    tracks[0]
  );
}

async function fetchTranscript(videoId) {
  const html = await fetchText(`https://www.youtube.com/watch?v=${videoId}`);

  const match = /"captionTracks":(\[.*?\])/.exec(html);
  if (!match) throw new Error('no captionTracks found on the watch page (video may have no captions)');

  let tracks;
  try {
    tracks = JSON.parse(match[1]);
  } catch (err) {
    throw new Error(`captionTracks JSON did not parse: ${err.message}`);
  }

  const track = pickCaptionTrack(tracks);
  if (!track || !track.baseUrl) throw new Error('no usable caption track');

  const captionXml = await fetchText(decodeEntities(track.baseUrl));
  const lines = [...captionXml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
    decodeEntities(m[1].replace(/<[^>]+>/g, '')).trim()
  );

  const transcript = lines.filter(Boolean).join(' ');
  if (!transcript) throw new Error('caption track was empty after parsing');
  return transcript;
}

module.exports = { fetchTranscript };
