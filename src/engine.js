const readline = require('readline');

// Deliberately narrow: many sites put the `.g-recaptcha` / `.h-captcha`
// CLASS directly on their ordinary, always-visible submit button (that's
// how Google's "invisible" reCAPTCHA is wired up) — that class alone does
// NOT mean a challenge is showing. The actual challenge only appears as its
// own iframe (reCAPTCHA's "bframe", hCaptcha's "checkbox"/"hcaptcha-challenge"
// frame) when the risk score is high enough to require a human. Only treat
// that, or a Cloudflare interstitial, as "found".
const CAPTCHA_SELECTORS = [
  'iframe[src*="recaptcha/api2/bframe"]',
  'iframe[src*="recaptcha/enterprise/bframe"]',
  'iframe[title*="recaptcha challenge" i]',
  'iframe[src*="hcaptcha.com/captcha"]',
  'iframe[title*="hcaptcha challenge" i]',
  '#cf-challenge-stage',
  '#challenge-form',
  // PerimeterX / HUMAN
  '#px-captcha',
  'iframe[src*="perimeterx"]',
  'iframe[src*="humansecurity"]',
  // DataDome
  'iframe[src*="datadome"]',
  '#datadome-captcha',
  // Arkose Labs / FunCaptcha
  'iframe[src*="arkoselabs"]',
  'iframe[src*="funcaptcha"]',
  // GeeTest
  '.geetest_panel',
  '.geetest_panel_box',
];

const CAPTCHA_TITLE_PATTERN =
  /just a moment|attention required|are you human|access denied|verify you are human|pardon our interruption|request unsuccessful|incapsula incident/i;

const CAPTCHA_BODY_TEXT_PATTERN =
  /incapsula incident id|please enable (cookies|javascript) and (reload|disable)|reference #\d+.*blocked|unusual traffic from your (computer|network)/i;

// reCAPTCHA/hCaptcha keep their challenge iframe permanently present in the
// DOM and only move it on-screen when a challenge is actually required
// (otherwise it sits at e.g. `top: -9999px`). Playwright's locator.isVisible()
// only checks display/visibility/opacity/bounding-box-non-empty — an
// off-screen-positioned iframe still passes that check and reads as
// "visible", which is a false positive here. So check real on-screen
// placement (intersects the viewport) directly instead.
async function detectCaptcha(page) {
  const title = await page.title().catch(() => '');
  if (CAPTCHA_TITLE_PATTERN.test(title)) {
    return { found: true, reason: `page title suggests a bot-check ("${title}")` };
  }
  const match = await page
    .evaluate((selectors) => {
      for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          const onScreen =
            rect.width > 40 &&
            rect.height > 40 &&
            rect.top < window.innerHeight &&
            rect.bottom > 0 &&
            rect.left < window.innerWidth &&
            rect.right > 0;
          if (onScreen && style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0) {
            return sel;
          }
        }
      }
      return null;
    }, CAPTCHA_SELECTORS)
    .catch(() => null);
  if (match) {
    return { found: true, reason: `on-screen element matching "${match}"` };
  }

  // Akamai/Imperva-style bot walls often just render a plain text block
  // page rather than a distinct iframe/element — catch the common wording.
  const bodyText = await page.locator('body').innerText({ timeout: 1000 }).catch(() => '');
  if (CAPTCHA_BODY_TEXT_PATTERN.test(bodyText)) {
    return { found: true, reason: 'page text matches a known bot-wall block message' };
  }

  return { found: false, reason: null };
}

// Prompts the user in the terminal to solve a CAPTCHA in the visible browser
// window, then continue. Returns 'continue' or 'skip'.
function askUserToSolveCaptcha(label, waitMinutes) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const timeoutMs = waitMinutes * 60 * 1000;
    const timer = setTimeout(() => {
      rl.close();
      resolve('skip');
    }, timeoutMs);

    rl.question(
      `\n[${label}] CAPTCHA / bot-check detected. Solve it in the browser window, ` +
        `then press Enter to continue (or type "s" + Enter to skip this site) ` +
        `[auto-skip in ${waitMinutes} min]: `,
      (answer) => {
        clearTimeout(timer);
        rl.close();
        resolve(answer.trim().toLowerCase() === 's' ? 'skip' : 'continue');
      }
    );
  });
}

// Checks for a genuinely on-screen CAPTCHA challenge and, if one is found,
// pauses for a human per settings.pauseOnCaptcha (or throws CaptchaSkipped
// straight away if pausing is disabled). Does nothing if no challenge shows.
async function pauseIfCaptcha(page, ctx) {
  const captcha = await detectCaptcha(page);
  if (!captcha.found) return;
  if (ctx.settings.pauseOnCaptcha) {
    const decision = await askUserToSolveCaptcha(ctx.label, ctx.settings.captchaWaitMinutes);
    if (decision === 'skip') {
      throw new CaptchaSkipped(captcha.reason);
    }
  } else {
    throw new CaptchaSkipped(captcha.reason);
  }
}

// Wraps a click that is expected to trigger a (possibly invisible) reCAPTCHA
// / hCaptcha challenge. If a challenge becomes visible right after the
// click, pauses for a human per settings.pauseOnCaptcha.
async function clickAndHandleCaptcha(page, selector, ctx) {
  await page.click(selector);
  await page.waitForTimeout(1500);
  await pauseIfCaptcha(page, ctx);
}

// Some sites (SmallSEOTools, PrepostSEO, etc.) run a JS framework whose
// submit button stays disabled/inert until it sees real keystroke events on
// the field. Playwright's locator.fill() sets the value directly and only
// fires 'input'/'change', which some of these frameworks don't react to
// (the button silently never leaves its "Loading" placeholder state and the
// click does nothing). Typing character-by-character fires keydown/keyup
// too, matching what a real user does, so use this instead of .fill() for
// any field on a site that behaves like that.
async function typeLikeHuman(page, selector, text) {
  const locator = typeof selector === 'string' ? page.locator(selector) : selector;
  await locator.click();
  await locator.fill('');
  await locator.pressSequentially(text, { delay: 20 });
}

// Fresh Playwright profiles have no accepted-cookies state, so consent
// banners (OneTrust, Cookiebot, etc.) show up on first visit and can
// physically overlay the form, intercepting clicks even on elements that
// are themselves "visible" and "enabled" (this is what broke Pingdom Tools
// and PrepostSEO on a clean profile). Best-effort dismiss before doing
// anything else on the page; never throws.
const COOKIE_BANNER_SELECTORS = [
  '#onetrust-accept-btn-handler',
  '.onetrust-close-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  '.CybotCookiebotDialogBodyButton',
  '#didomi-notice-agree-button',
  'button[aria-label="Agree" i]',
  'button[aria-label="Accept" i]',
  'button[aria-label="Accept all" i]',
];

const COOKIE_BANNER_TEXT_PATTERN = /^(accept( all)?( cookies)?|i agree|agree|allow all|got it|ok|i understand)$/i;

async function dismissCookieBanners(page) {
  // Consent-management scripts (OneTrust etc.) commonly inject the banner
  // a few hundred ms *after* domcontentloaded, so a dismiss attempt made
  // immediately on navigation can miss it — then it appears just in time to
  // block the very next click on the real form. Give it a moment, and make
  // two passes in case the banner (re-)renders after the first click.
  await page.waitForTimeout(1000);

  for (let pass = 0; pass < 2; pass += 1) {
    for (const selector of COOKIE_BANNER_SELECTORS) {
      const locator = page.locator(selector).first();
      if (await locator.isVisible({ timeout: 800 }).catch(() => false)) {
        await locator.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(300);
      }
    }
    await dismissCookieBannerByText(page);
    await page.waitForTimeout(400);
  }
}

// Generic fallback: click any short-text visible button/link matching
// common consent wording (covers banners not on the known-selector list).
async function dismissCookieBannerByText(page) {
  await page
    .evaluate(({ source, flags }) => {
      const re = new RegExp(source, flags);
      const candidates = document.querySelectorAll('button, a[role="button"], input[type="button"]');
      for (const el of candidates) {
        const text = (el.textContent || el.value || '').trim();
        if (text.length < 30 && re.test(text)) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            el.click();
            return true;
          }
        }
      }
      return false;
    }, { source: COOKIE_BANNER_TEXT_PATTERN.source, flags: COOKIE_BANNER_TEXT_PATTERN.flags })
    .catch(() => false);
}

class CaptchaSkipped extends Error {
  constructor(reason) {
    super(`Skipped after CAPTCHA (${reason})`);
    this.name = 'CaptchaSkipped';
  }
}

const URL_INPUT_SELECTORS = [
  'input[type="url"]',
  'input[name*="url" i]',
  'input[id*="url" i]',
  'input[placeholder*="url" i]',
  'input[name*="link" i]',
  'input[placeholder*="link" i]',
  'textarea[name*="url" i]',
  'textarea[id*="url" i]',
  'textarea[placeholder*="url" i]',
];

const KEYWORD_INPUT_SELECTORS = [
  'input[name*="keyword" i]',
  'input[placeholder*="keyword" i]',
  'input[name*="tag" i]',
  'input[placeholder*="tag" i]',
  'input[name*="title" i]',
  'input[placeholder*="title" i]',
];

const SUBMIT_TEXT_PATTERN = /ping|submit|add url|add site|check|generate|create|start|go\b/i;

async function firstVisibleLocator(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      return locator;
    }
  }
  return null;
}

async function findSubmitButton(page) {
  const candidates = page.locator('button, input[type="submit"], input[type="button"], a[role="button"]');
  const count = await candidates.count();
  for (let i = 0; i < count; i += 1) {
    const el = candidates.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const text = ((await el.textContent().catch(() => '')) || '') + ' ' + ((await el.getAttribute('value').catch(() => '')) || '');
    if (SUBMIT_TEXT_PATTERN.test(text)) {
      return el;
    }
  }
  return null;
}

// Best-effort fallback used for any site without a hand-written `run()`.
async function genericSubmit(page, ctx) {
  const urlField = await firstVisibleLocator(page, URL_INPUT_SELECTORS);
  if (!urlField) {
    throw new Error('No URL-like input field found on the page');
  }
  await typeLikeHuman(page, urlField, ctx.url);

  const keywordField = await firstVisibleLocator(page, KEYWORD_INPUT_SELECTORS);
  if (keywordField) {
    await typeLikeHuman(page, keywordField, ctx.keyword);
  }

  const submitButton = await findSubmitButton(page);
  if (!submitButton) {
    throw new Error('No submit-like button found on the page');
  }
  await submitButton.click();
  await page.waitForTimeout(1500);
  await pauseIfCaptcha(page, ctx);

  await page.waitForTimeout(ctx.settings.postSubmitWaitMs);
}

module.exports = {
  detectCaptcha,
  askUserToSolveCaptcha,
  pauseIfCaptcha,
  clickAndHandleCaptcha,
  typeLikeHuman,
  dismissCookieBanners,
  genericSubmit,
  CaptchaSkipped,
};
