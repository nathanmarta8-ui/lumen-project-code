/* ============================================================
   LUMEN — Story data
   ------------------------------------------------------------
   This file is the site's content database. It ships EMPTY.

   How to add stories:
   1. Go to /admin.html and sign in.
   2. Create stories with "New story". Each published story is
      saved in your browser and immediately previewable.
   3. Click "Download stories.js" in the admin dashboard.
   4. Replace THIS file (data/stories.js) with the download.
   5. Redeploy (git push, or re-drag the folder to Netlify).
      Your stories are now live for everyone.

   Story object shape (for reference):
   {
     slug, headline, lede, whyItMatters, bodyHtml,
     category,            // Medicine | Biotechnology | Health Tech | Brain Science | Longevity | Global Health | Mental Health
     subCategory, impact, // impact: integer 1–10
     readTime,            // minutes, integer
     publishDate,         // ISO string
     author, region,      // region: Global | Americas | Europe | Africa | Asia-Pacific
     pullQuote, pullQuoteAttribution,
     sourceType,          // Peer-reviewed | Institutional source | Pre-print
     journal, journalUrl, trialPhase, patientN,
     effectSize, diseaseBurden, nctId,
     heroImage, imageCaption, imageCredit, videoUrl,
     metaDescription, breaking, featured,
     readersToday, reactions: { fascinating, important, global, hope, share }
   }
   ============================================================ */

window.LUMEN_DATA = {
  stories: [],
  corrections: []
};
