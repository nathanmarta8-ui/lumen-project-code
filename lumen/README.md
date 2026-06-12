# Lumen — readlumen.site

Breakthroughs Brought to Light. Built to LUMEN_GUIDELINES.md v2.0.

## What's in the box

```
lumen/
├── index.html          Homepage (hero, today grid, signal list, most read, etc.)
├── story.html          Article page  → story.html?slug=your-story-slug
├── category.html       Section pages → category.html?cat=medicine (&impact=8)
├── corrections.html    Public correction log
├── admin.html          CMS: login, dashboard, story uploader + AI filter, story table
├── api/claude.js       Serverless proxy for the "Check with AI" editorial filter
├── assets/styles.css   Full design system (warm cream palette, Playfair/Inter)
├── assets/app.js       Front-end rendering logic
└── data/stories.js     ← YOUR CONTENT LIVES HERE (ships empty)
```

No build step, no framework, no dependencies. Static files + one serverless function.

## How publishing a story works (no database yet)

1. Open **/admin.html** and sign in.
   Default credentials are at the top of `admin.html` in the `TEAM` array —
   **change them before deploying.**
2. **New story** → fill the form. You get live preview, character counters,
   auto slug, auto read time, image upload (auto-resized to 1600px), and the
   five-point **Check with AI** button.
3. **Publish now.** The story is instantly visible *to you* (stored in your
   browser) so you can review it on the real homepage and article page.
   A notice bar reminds you it isn't public yet.
4. Dashboard → **Download stories.js** → replace `data/stories.js` with the
   downloaded file → redeploy. Now it's live for everyone.

This is the honest static-site workflow: visitors can only see what's in the
deployed files. When you outgrow it, see "Upgrading" below.

## Going live on readlumen.site

### Option A — Vercel (recommended; the AI filter works out of the box)

1. Create a free account at vercel.com and push this folder to a GitHub repo
   (or use `npx vercel` from inside the folder — no repo needed).
2. Import the repo in Vercel. Framework preset: **Other**. No build command.
3. Add your Anthropic API key (for the admin AI check):
   Project → Settings → Environment Variables → `ANTHROPIC_API_KEY`.
   (Get a key at console.anthropic.com — usage is pennies at 500 tokens/check.)
4. Project → Settings → Domains → add `readlumen.site` and `www.readlumen.site`.
5. Vercel shows you the DNS records. At your domain registrar's DNS panel:
   - `A` record, host `@`, value `76.76.21.21` (Vercel will confirm the exact IP)
   - `CNAME` record, host `www`, value `cname.vercel-dns.com`
6. Wait for DNS to propagate (minutes to a few hours). HTTPS is automatic.

Every future `git push` (or `npx vercel --prod`) redeploys — that's also how
your downloaded `stories.js` goes live.

### Option B — Netlify (fastest first deploy)

Drag the whole folder onto app.netlify.com/drop — the site is live in seconds.
Add your custom domain under Site settings → Domain management and set the DNS
records it shows you. Note: `api/claude.js` is written for Vercel; on Netlify
the AI check will show "unavailable, proceed manually" unless you port it to a
Netlify Function (ask Claude to do this if you choose Netlify).

## Before you launch — honest checklist

- [ ] Change the admin credentials in `admin.html` (`TEAM` array).
- [ ] Publish your ~10 stories via admin → download stories.js → redeploy.
- [ ] Newsletter: the signup form currently stores emails in the visitor's own
      browser (i.e. it's a placeholder). Wire it to Beehiiv, Buttondown, or
      Mailchimp — each gives you a form action URL to drop into
      `assets/app.js` (`newsletterHTML`). Don't launch the Tue/Fri promise
      without this.
- [ ] Add a privacy policy page and link it in the footer (required for
      AdSense and EU visitors). The medical disclaimer is already in the footer.
- [ ] Reader counts and reaction counts display whatever numbers are in your
      story data — leave them at 0 until you have real analytics. Zeros are
      hidden automatically.
- [ ] Add a favicon (drop favicon.ico in the root).

## Known limits of this version (by design)

- **Admin auth is cosmetic.** Credentials sit in client-side source. That's
  fine for now because publishing still requires you to redeploy files —
  a stranger can't change your live site — but don't reuse a real password.
- **Reactions/sign-in for readers** are visual only ("accounts coming soon").
- **Stories live in a file**, so publishing = redeploying.

## Upgrading later (the Supabase path)

When redeploy-to-publish gets old: create a free Supabase project, move
stories into a `stories` table, swap `data/stories.js` for a fetch call in
`assets/app.js`, and use Supabase Auth for the admin. The page templates,
design system, and admin form all carry over unchanged. Ask Claude to do this
migration when you're ready — it's a contained change.
