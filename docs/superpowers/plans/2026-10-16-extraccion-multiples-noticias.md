# Extraction showing several news items in a row

Report: opening some news in the reader (Android) shows several articles one after another.

## Findings (sample: ~257 real article pages from the 33 configured Spanish feeds, raw HTML as the app fetches it)
- Regular article pages from the major outlets extracted as a single article (no repeated bylines/headlines found).
- Reproduced: a feed link that points to a front page (Servimedia's feed only lists `/home`). `extractFromHtml` ran Readability on the home and returned ~16.8k chars of concatenated headlines and summaries. Mobile `showHtml` calls `extractFromHtml` directly (no listing classification, unlike the desktop webview path `buildPageMessage`).
- Not fixed on purpose: live blogs (Europa Press, 20minutos, Antena 3, El Pais) are one event with many timestamped entries; they are kept as one article.
- Structures that cannot appear in static HTML but do in a rendered DOM ("Ver original" returns the live DOM on mobile): infinite scroll appending the next full `<article>`, preloaded "next article" sections, "recomendadas" blocks with full text. Reproduced with synthetic fixtures.

## Fix (packages/extract, shared by desktop and mobile through `extractArticle`/`extractFromHtml`)
- `extract.ts`: returns `null` for listing pages (classifier + >= MIN_ITEMS headlines) and for section/home URLs (`isSectionUrl`) that do not declare themselves as an article (og:type / JSON-LD).
- `single.ts` (new), run on the clone before Readability:
  - `keepPrimaryArticle`: with several top-level `<article>`/`itemtype=Article` blocks, keeps the one matching the page (own URL vs canonical/og:url/URL, heading vs og:title/h1/JSON-LD headline, contains the first h1) and drops the others that have a foreign heading/URL.
  - `dropFollowModules`: drops next/related/recommended/most-read/infinite-scroll modules (by class/id tokens) that carry running text of other stories, never the block holding the page h1 or most of the text.
  - `cutAtNextStory`: a second long `h1` that is not the page headline, after >= 600 chars of paragraphs, starts the next story; everything after it is cut.
- Paywall handling untouched.
- Result on the sample: 255 of 257 outputs byte-identical in length, the 2 differences are the Servimedia home now rejected (`not-article`).

## Limits
- Live blogs keep all entries (some embed other stories as entries).
- If a page has no signal tying one `<article>` to the page, nothing is removed (could be a multi-part article).
- Pages whose headings are reused as `h1` for subheads and exceed the thresholds could be cut early (rare).
- Tests: `packages/extract/src/single.test.ts` with synthetic fixtures `test/fixtures/multiples-*.html`.
