const nodemailer = require('nodemailer');

// Gmail SMTP over an App Password (myaccount.google.com/apppasswords —
// requires 2-Step Verification on the sending account). No OAuth flow, no
// extra Google Cloud project: this is the simplest thing that works for an
// unattended scheduled script.
function buildTransport(email) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: email.from, pass: email.appPassword },
  });
}

function summaryLines(summary) {
  const statusLines = Object.entries(summary.byStatus)
    .map(([status, count]) => `  ${status}: ${count}`)
    .join('\n');
  const browserLines = Object.entries(summary.byBrowser)
    .map(([browser, stats]) => {
      const parts = Object.entries(stats)
        .filter(([k]) => k !== 'total')
        .map(([status, count]) => `${status}: ${count}`)
        .join(', ');
      return `  ${browser}: ${stats.total} attempted (${parts})`;
    })
    .join('\n');

  const targetLines = Object.entries(summary.byTarget)
    .map(([url, count]) => `  ${url}: ${count}`)
    .join('\n');

  const proxyLine = summary.proxyCountry
    ? `\nProxy: ${summary.proxy ? `${summary.proxy} (${summary.proxyCountry})` : `none reachable for ${summary.proxyCountry} — ran direct`}`
    : '';

  return `Started:  ${summary.startedAt}
Finished: ${summary.finishedAt}
Total attempts: ${summary.totalAttempts}${proxyLine}

By status:
${statusLines}

By browser:
${browserLines}

By target link:
${targetLines}`;
}

function enrichmentLines(enrichment) {
  if (!enrichment) return '';
  const { discovered, reliability, syndication, social } = enrichment;

  const discoveryLines = [
    `  sitemap pages found: ${discovered.sitemapUrls.length}`,
    `  videos found: ${discovered.videos.length}`,
    ...discovered.errors.map((e) => `  warning: ${e}`),
  ].join('\n');

  const flaggedLines = reliability.flagged.length
    ? reliability.flagged.map((f) => `  ${f.site}: ${f.submitted}/${f.attempts} (${Math.round(f.rate * 100)}%)`).join('\n')
    : '  none';

  const syndicationLines = [
    ...syndication.posted.map((p) => `  posted: ${p.title} (${p.kind}) -> ${p.devto || p.hashnode || ''}`),
    ...syndication.skipped.map((s) => `  skipped: ${s.kind} ${s.id || ''} (${s.reason})`),
    ...syndication.errors.map((e) => `  error: ${e.kind} ${e.ref} - ${e.message}`),
  ].join('\n') || '  none this run';

  const socialLines = [
    ...social.posted.map((p) => `  ${p.platform}: ${p.url || 'posted'}`),
    ...social.errors.map((e) => `  ${e.platform} error: ${e.message}`),
  ].join('\n') || '  none this run';

  return `

Content discovery:
${discoveryLines}

Site reliability (rolling, flagged = <50% success over several runs):
${flaggedLines}

Content syndication (Dev.to / Hashnode):
${syndicationLines}

Social sharing:
${socialLines}`;
}

// Sends the finished run's HTML + JSON reports as attachments, with a plain
// summary in the body. Never throws — a mail failure (bad password, no
// network, quota) is logged and swallowed so it can't take down a run that
// otherwise completed fine; the report files on disk are still the source
// of truth.
async function sendReportEmail({ settings, summary, htmlPath, jsonPath, enrichment }) {
  const { email } = settings;

  if (!email.enabled) {
    console.log('Report email disabled (SEND_REPORT_EMAIL=false) — skipping.');
    return;
  }
  if (!email.appPassword) {
    console.log('Report email skipped: GMAIL_APP_PASSWORD is not set.');
    return;
  }

  const failedCount = (summary.byStatus.failed || 0) + (summary.byStatus['skipped-captcha'] || 0);
  const outcome = failedCount > 0 ? `${failedCount} issue(s)` : 'all clean';
  const countryTag = summary.proxyCountry ? `[${summary.proxyCountry}] ` : '';
  const subject = `${countryTag}Backlink automation report — ${summary.totalAttempts} attempts, ${outcome} — ${summary.finishedAt}`;

  try {
    const transport = buildTransport(email);
    await transport.sendMail({
      from: email.from,
      to: email.to,
      subject,
      text: summaryLines(summary) + enrichmentLines(enrichment),
      attachments: [
        { filename: 'report.html', path: htmlPath },
        { filename: 'report.json', path: jsonPath },
      ],
    });
    console.log(`Report email sent to ${email.to}`);
  } catch (err) {
    console.error('Failed to send report email:', err.message);
  }
}

module.exports = { sendReportEmail };
