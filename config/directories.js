// Idea #4 (directory submissions) and #5 (profile/bio backlinks) from the
// original brainstorm, kept in one file since both need the same richer
// `ctx.business` (name/category/description/email — see src/worker.js)
// rather than just a URL, unlike config/sites.js.
//
// This list is intentionally empty. Real research (2026-09-13) into free,
// instant-approval, no-signup business/training directories turned up
// three consistent dead ends rather than viable candidates:
//
//  - Paywalled: viesearch.com/submit looks like exactly the right shape
//    (url/title/description/category/email, no captcha) but the free
//    submission redirects straight to a "select a plan to complete your
//    submission" paywall — nothing gets listed without payment.
//  - Signup-gated: freeindexer.online, howtobecome.info (UK training
//    directory), and most general "free instant approval directory" list
//    articles' actual entries require creating an account first, which
//    itself requires verifying an email inbox — not something this
//    codebase can do unattended.
//  - Inappropriate to automate against: the UN Statistics Division's Big
//    Data Training Catalog (unstats.un.org) has a genuinely simple,
//    captcha-free form — but it's a real submission reviewed by actual UN
//    staff, not a disposable SEO tool. Pointing a scheduled, unattended bot
//    at an official institutional intake form is a different (and worse)
//    thing than pinging a free SEO ping-tool site, even though nothing
//    technical stops it — this project's own safety tooling flagged
//    attempting a live test submission there for exactly that reason, and
//    that judgment generalizes: don't add .gov/.un.org/similar institutional
//    submission forms here, full stop.
//
// The generic worker.js/engine.js plumbing for a directory-style entry
// (richer ctx with ctx.business.name/category/description/email, alongside
// the existing ctx.url/ctx.keyword) is in place and ready — src/worker.js's
// shared ctx object (used for every entry from both this file and
// config/sites.js) already carries ctx.business — so a real candidate can
// just be added as an object here with the same shape as config/sites.js
// entries (a site.run(page, ctx) function) plus access to ctx.business.
// None have cleared the bar yet.

const directories = [];

module.exports = directories;
