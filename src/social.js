// Idea #8: shares this run's target links to social profiles via each
// platform's official REST API — deliberately NOT browser automation like
// config/sites.js. Logging into a personal/company social account with
// Playwright and clicking through a compose box is exactly the kind of
// thing these platforms' bot-detection is built to catch (far more so than
// a free SEO ping tool), and a flagged/locked social account is a much
// worse outcome than one failed ping. The official API path needs you to
// create a developer app on each platform first — see README.md — and
// every function here is a no-op (never called) unless its
// settings.social.<platform>.enabled is true.

async function postJson(url, { method = 'POST', headers = {}, body } = {}) {
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Twitter/X API v2 tweet creation (POST /2/tweets). Needs a user-context
// OAuth 2.0 bearer token with `tweet.write` scope — an app-only bearer
// token (the kind you get for read-only search) cannot post; see
// README.md. As of 2026 this endpoint is on Twitter's paid API tiers.
async function postToTwitter(text, settings) {
  const { bearerToken } = settings.social.twitter;
  const data = await postJson('https://api.twitter.com/2/tweets', {
    headers: { authorization: `Bearer ${bearerToken}`, 'content-type': 'application/json' },
    body: { text },
  });
  return data && data.data ? `https://twitter.com/i/web/status/${data.data.id}` : null;
}

// LinkedIn's UGC Posts API (POST /v2/ugcPosts), posting as a person or
// organization URN (settings.social.linkedin.actorUrn, e.g.
// "urn:li:person:xxxx" or "urn:li:organization:xxxx"). Needs an access
// token with the w_member_social (or w_organization_social) scope from a
// LinkedIn developer app that's been through their product-access review —
// see README.md.
async function postToLinkedIn(text, url, settings) {
  const { accessToken, actorUrn } = settings.social.linkedin;
  const data = await postJson('https://api.linkedin.com/v2/ugcPosts', {
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: {
      author: actorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'ARTICLE',
          media: [{ status: 'READY', originalUrl: url }],
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    },
  });
  return data && data.id ? data.id : null;
}

// Facebook Graph API page feed post (POST /{page-id}/feed) with a
// long-lived Page Access Token — see README.md for how to generate one via
// a Facebook developer app + Graph API Explorer.
async function postToFacebook(text, url, settings) {
  const { pageAccessToken, pageId } = settings.social.facebook;
  const params = new URLSearchParams({ message: text, link: url, access_token: pageAccessToken });
  const data = await postJson(`https://graph.facebook.com/v19.0/${pageId}/feed?${params.toString()}`, {
    headers: { 'content-type': 'application/json' },
    body: undefined,
  });
  return data && data.id ? `https://www.facebook.com/${data.id}` : null;
}

function composeText(target, keyword) {
  return `New: ${keyword} — ${target}`;
}

// Shares `target` (this run's picked link — see config/settings.js's
// pickTargetUrl) to every enabled platform. Never throws: each platform's
// failure is caught and returned in the report rather than raised, exactly
// like syndicateContent, so a revoked token on one platform can't block
// the others or the run itself.
async function shareToSocial(target, keyword, settings) {
  const { twitter, linkedin, facebook } = settings.social;
  const report = { posted: [], errors: [] };
  const text = composeText(target, keyword);

  const attempts = [
    twitter.enabled && { platform: 'twitter', run: () => postToTwitter(text, settings) },
    linkedin.enabled && { platform: 'linkedin', run: () => postToLinkedIn(text, target, settings) },
    facebook.enabled && { platform: 'facebook', run: () => postToFacebook(text, target, settings) },
  ].filter(Boolean);

  for (const attempt of attempts) {
    try {
      const url = await attempt.run();
      report.posted.push({ platform: attempt.platform, url });
    } catch (err) {
      report.errors.push({ platform: attempt.platform, message: err.message });
    }
  }

  return report;
}

module.exports = { shareToSocial, postToTwitter, postToLinkedIn, postToFacebook };
