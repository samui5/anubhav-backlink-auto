// Idea #6/#7: cross-posts real content to Dev.to and Hashnode via their
// official REST/GraphQL APIs (never form-scraping — see README.md for why
// that distinction matters for these two specifically) with a
// `canonical_url` pointing back at the original page, so search engines
// attribute the content to the source rather than flagging it as
// duplicate. Two content sources:
//
//  - Idea #6: a newly-discovered sitemap page (src/discovery.js) is fetched
//    and its own text becomes the syndicated article — no LLM involved,
//    always available.
//  - Idea #7: a newly-discovered video is turned into a short recap post by
//    asking the Claude API to summarize its transcript (src/transcripts.js)
//    — skipped gracefully whenever a transcript isn't available. As of this
//    writing (2026-09-13) YouTube's legacy caption endpoint is returning
//    empty responses for auto-generated ("asr") tracks specifically (see
//    the comment in src/transcripts.js), so in practice this will often
//    skip until that either changes or a proper YouTube Data API captions
//    call replaces it — the pipeline is correct and ready either way.
//
// Both platforms are independently no-ops unless their settings.syndication
// credentials are set (see config/settings.js) — nothing here runs, and
// nothing fails a run, until you add them.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { fetchTranscript } = require('./transcripts');

function loadLedger(ledgerPath) {
  try {
    return JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  } catch {
    return { articles: {}, videos: {} };
  }
}

function saveLedger(ledgerPath, ledger) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), 'utf8');
}

// Best-effort readable-text extraction: loads the page in a headless
// browser (consistent with the rest of this project, and far more robust
// than regexing raw HTML) and strips the obvious non-content chrome before
// reading innerText.
async function extractArticleContent(url) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(800);
    const { title, text } = await page.evaluate(() => {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('nav, header, footer, script, style, noscript, svg, form').forEach((el) => el.remove());
      return { title: document.title, text: clone.innerText.replace(/\n{3,}/g, '\n\n').trim() };
    });
    if (!text || text.length < 200) throw new Error('page had too little text content to syndicate');
    return { title, text: text.slice(0, 6000) };
  } finally {
    await browser.close();
  }
}

async function callClaude(apiKey, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || '').join('');
  if (!text) throw new Error('Claude API returned no text');
  return text;
}

async function generateVideoRecap(video, settings) {
  const transcript = await fetchTranscript(video.id); // throws if unavailable — caller skips on failure
  const prompt = `Write a short (250-400 word) blog-style recap of the YouTube video below for a technical training company's blog. Write in third person, don't say "in this video" more than once, and end with a one-line call to action to watch the full video at ${video.url}. Return only the recap body in Markdown, no title heading.

Video title: ${video.title}

Transcript:
${transcript.slice(0, 8000)}`;
  const body = await callClaude(settings.syndication.anthropicApiKey, prompt);
  return { title: video.title, body: `${body}\n\n[Watch the full video](${video.url})` };
}

async function postToDevTo({ title, bodyMarkdown, canonicalUrl, tags }, apiKey) {
  const res = await fetch('https://dev.to/api/articles', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api-key': apiKey },
    body: JSON.stringify({
      article: {
        title,
        published: true,
        body_markdown: bodyMarkdown,
        canonical_url: canonicalUrl,
        tags: (tags || []).slice(0, 4),
      },
    }),
  });
  if (!res.ok) throw new Error(`Dev.to API HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.url;
}

// Hashnode's public GraphQL API (https://gql.hashnode.com) — the
// publishPost mutation shape below matches Hashnode's documented schema at
// the time this was written; unlike every other integration in this
// project, it has never been exercised against a real token (none was
// available), so treat this one specifically as unverified until you've
// run it once with a real HASHNODE_TOKEN/HASHNODE_PUBLICATION_ID and
// confirmed the response shape still matches.
async function postToHashnode({ title, contentMarkdown, canonicalUrl, tags }, token, publicationId) {
  const query = `mutation PublishPost($input: PublishPostInput!) {
    publishPost(input: $input) { post { id url } }
  }`;
  const variables = {
    input: {
      title,
      contentMarkdown,
      originalArticleURL: canonicalUrl,
      publicationId,
      tags: (tags || []).slice(0, 4).map((slug) => ({ slug, name: slug })),
    },
  };
  const res = await fetch('https://gql.hashnode.com', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: token },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Hashnode API HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (data.errors) throw new Error(`Hashnode API error: ${JSON.stringify(data.errors).slice(0, 300)}`);
  return data.data.publishPost.post.url;
}

// Runs both syndication sources against this run's freshly-discovered
// sitemap URLs and videos, skipping anything already posted (per the
// ledger) or that fails to produce content, and posting to whichever of
// Dev.to/Hashnode are enabled. Never throws — every per-item and
// per-platform failure is caught and recorded in the returned report
// instead, so one bad post can't take down the rest of the run.
async function syndicateContent(settings, discovered) {
  const { devto, hashnode } = settings.syndication;
  const report = { posted: [], skipped: [], errors: [] };
  if (!devto.enabled && !hashnode.enabled) return report;

  const ledger = loadLedger(settings.syndication.ledgerPath);
  ledger.articles = ledger.articles || {};
  ledger.videos = ledger.videos || {};

  const targets = [
    ...discovered.sitemapUrls
      .filter((url) => !ledger.articles[url])
      .slice(0, 2) // cap per-run so one run doesn't fire off a dozen cross-posts at once
      .map((url) => ({ kind: 'article', url })),
    ...discovered.videos
      .filter((v) => !ledger.videos[v.id])
      .slice(0, 1)
      .map((v) => ({ kind: 'video', video: v })),
  ];

  for (const target of targets) {
    try {
      let content;
      let canonicalUrl;
      let tags;
      if (target.kind === 'article') {
        canonicalUrl = target.url;
        const extracted = await extractArticleContent(target.url);
        content = { title: extracted.title, body: extracted.text };
        tags = ['sap', 'training'];
      } else {
        if (!settings.syndication.anthropicApiKey) {
          report.skipped.push({ kind: 'video', id: target.video.id, reason: 'ANTHROPIC_API_KEY not set' });
          continue;
        }
        canonicalUrl = target.video.url;
        content = await generateVideoRecap(target.video, settings);
        tags = ['sap', 'youtube'];
      }

      const posted = { kind: target.kind, canonicalUrl, title: content.title, devto: null, hashnode: null };

      if (devto.enabled) {
        posted.devto = await postToDevTo(
          { title: content.title, bodyMarkdown: content.body, canonicalUrl, tags },
          devto.apiKey
        );
      }
      if (hashnode.enabled) {
        posted.hashnode = await postToHashnode(
          { title: content.title, contentMarkdown: content.body, canonicalUrl, tags },
          hashnode.token,
          hashnode.publicationId
        );
      }

      report.posted.push(posted);
      if (target.kind === 'article') ledger.articles[target.url] = { t: new Date().toISOString() };
      else ledger.videos[target.video.id] = { t: new Date().toISOString() };
    } catch (err) {
      report.errors.push({
        kind: target.kind,
        ref: target.kind === 'article' ? target.url : target.video.id,
        message: err.message,
      });
    }
  }

  saveLedger(settings.syndication.ledgerPath, ledger);
  return report;
}

module.exports = {
  syndicateContent,
  extractArticleContent,
  generateVideoRecap,
  postToDevTo,
  postToHashnode,
};
