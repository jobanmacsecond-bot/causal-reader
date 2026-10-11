# Causal — global news in context

A working prototype with global headlines from curated international and regional newsrooms, in-page publisher excerpts, permitted official source text, and automatic suggestions of earlier related events.

## Open or run

The current local copy is at http://127.0.0.1:8885. This address works on this computer while the server is running.

For the dependency-free local version, use Node.js 18 or newer:

```sh
node server.mjs
```

Then open http://127.0.0.1:8885. Set PORT to another port if it is already occupied. Start-Causal.command starts the same server on macOS and opens the browser once it is reachable. Open the website through that address rather than double-clicking public/reader.html; the HTML file by itself cannot load live news. Direct file opening now shows an explicit recovery link, and startup failures end loading with a reload action. This version needs no installation or API keys. The optional Vinext hosting build uses the Node version specified in package.json.

## Source coverage

Live English-language feeds: BBC News, The Guardian, Al Jazeera, France 24, DW, CNA, RNZ Pacific, CBC News, and Africanews. These include reporting about Africa, the Americas, Asia, Europe, the Middle East, and Oceania. This is worldwide coverage from a curated source set, not every country, publisher, language, or article.

Federal Register, Federal Reserve Board, and European Central Bank provide official policy and economic records. The source coverage dialog shows availability and feed links. A failed source is reported; no fictional fallback stories are generated.

Publisher RSS excerpts are readable inside the page and explicitly labeled. The original publication link opens the complete commercial article, which may require a subscription. Permitted official publications are reproduced in full with attribution when retrieval succeeds. Article pages, paywalls, or framing protections are not bypassed.

## What works

- Interactive globe: drag or touch to rotate, scroll or use +/− to zoom, and click a country to filter its headlines.
- Country picker for small countries, geographic story markers, per-country counts, and reset to the world view. Arrow keys rotate the globe; +/− zoom; Home resets.
- Location selection stays connected to the source reader and earlier context. Empty locations clear the previous story and explain that the current feeds have no matching headlines.
- Top headlines ordered by freshness, publisher feed placement, approximate same-event coverage across outlet groups, and major public or economic developments.
- Source and region variety in the feed; detected wire copies count as one editorial family.
- Latest-first ordering, six region filters, topic filters, and headline/summary search.
- Visible reasons for headline ranking, separate from causal relevance.
- Automatic searches for earlier context, including older official records omitted from current headlines.
- In-page related-source reader, evidence gaps, publication timing, and attributed passages when detected.
- Browser-local saved story references; references show while present in the loaded feed.
- Refreshed feeds replace corrected publisher excerpts rather than retaining stale reader text.

## Ranking limits

Feed position and related coverage are approximations. This is not measured worldwide popularity or a numeric publisher trust score. Globe locations come from countries and selected city/demonym mentions in report titles and excerpts, or explicit structured country fields, never publisher headquarters. They are approximate and do not prove an event happened there. A report can appear in multiple countries. Country selection filters the currently loaded stories; zoom changes the view and does not automatically fetch a city's local news. Region labels can also use publisher coverage. Exact repost deduplication and detected wire credits reduce repeated coverage; RSS does not always identify original provenance.

The context engine uses deterministic English subject/entity/sector/chronology rules. It does not use generative AI and cannot establish causation. Suggested results are hypotheses, attributed explanations, or related context. Publication dates are not assumed to be event dates. Country overlap and generic words alone cannot create a contributor hypothesis. Alternatives and missing evidence stay visible.

Context search covers current publisher feeds and searchable official US and European records. It does not search a complete historical worldwide archive. A future upgrade could add a licensed article archive and a server-side model with evaluated causal-link extraction. No paid service has been activated.

## Privacy

Feeds are fetched on the server. Official source APIs receive search terms. Saved references stay in browser local storage; no account profile or reading history database is created. Article data is not sent to a model provider. Fonts, globe outlines, and map libraries are served locally. Font license notices are in public/fonts.

## Security and reliability

- Strict Content Security Policy, anti-framing, no-referrer, MIME protections, restricted browser permissions, and HTTPS transport headers in the hosted worker and static asset configuration.
- GET-only APIs with bounded inputs, exact parameters, and cross-site request restrictions. The local server listens only on loopback and checks the requested host.
- External retrieval is limited to approved HTTPS source hosts and redirects, with timeouts and response size limits. Users cannot submit arbitrary fetch URLs.
- Bounded caches, shared upstream requests, concurrency limits, and refresh cooldowns reduce unnecessary source traffic. These limits are per worker instance; they are not a global rate limiter or a substitute for hosting-level abuse controls.
- Internal upstream errors are hidden from visitors. Failed refreshes retain and label the previous feed. Reader requests time out and cancel when superseded; related-story dialogs cannot display a superseded response.
- Cold workers recover current story references by loading only approved feeds. Older historical records are still held in each worker's research cache; after a restart or on another worker, records no longer in the current feeds can expire and require opening the original source.
- Locally saved story references are validated and bounded. Keyboard focus, touch controls, reduced motion, loading states, and empty country views are supported.

The prototype has been hardened and checked, not independently penetration-tested. Private owner access is configured in Sites. No public access or paid service was enabled.

## Verification

93 automated checks pass for feed parsing, dates, input limits, API protections, URL/redirect restrictions, cache bounds, concurrent requests, cold-worker recovery, reader startup recovery, syndicated coverage, headline ordering, causal relevance, geography, corrected excerpts, historical policy context, and hosted server origin restrictions. Ten UI regression checks cover request cancellation, stale responses, initial loading, failed refreshes, and saved references. All 12 source endpoints were available in the live check. Browser verification covered country selection through the picker and globe, empty locations, drag, scroll/button zoom, reset, and desktop/mobile layout, in addition to the existing reader checks. The production build passed. Local Cloudflare worker smoke checks reached the bundled page and fonts, rejected an invalid API request, loaded 180 headlines, and retained ranking information in the article response. A temporary public HTTPS preview also passed page, asset, news, article, context, country selection, zoom, and security checks. Permanent deployment remains pending GitHub repository setup.

The npm production dependency audit reports zero known findings. The full audit retains 14 package findings in build, lint, and database tooling, including the unpatched braces parser. The current worker bundle excludes braces/micromatch and legacy esbuild development servers; visitor input is not evaluated as a glob pattern. Use a maintained, security-patched Node release for the optional local server: npm package overrides do not update Node's built-in fetch runtime.

## Globe resources

The globe uses locally bundled D3 Array 3.2.4, D3 Geo 3.1.1, TopoJSON Client 3.1.0, and World Atlas 2.0.2 country outlines derived from Natural Earth. No paid map service or map API key is needed. Versions, provenance, and license notices are in public/vendor/GEO-LICENSES.md. Boundary shapes and labels come from that dataset; they are a navigation aid, not a statement about territorial disputes.

## Hosted build

The Vinext starter and Sites project identity are retained. API routes share lib/news-service.mjs with the local server.

Private Sites publication is still blocked: automatic approval rejects the required source-helper stdin action because sandbox approval is disabled in this session. Source synchronization, version saving, and deployment have not completed. No permanent hosted URL is available yet.

## GitHub publication

The source folder has been initialized as a Git repository on the main branch. Environment files, credentials, generated assets, dependency caches, and the private Sites project identity are excluded from source publication.

GitHub and Render are connected, and the Render workspace has been selected. GitHub browser sign-in and repository creation are still pending. The explicit hosted entry and free Render service configuration are prepared; see RENDER.md. GitHub Pages serves static files and cannot run this site's /api/news, /api/article, and /api/causes handlers. Preserving the live reader requires deploying the server alongside the static assets on a compatible host. A Pages-only version would need a separate snapshot build and clearly labeled scheduled refreshes.

**link to the webpage.txt** contains the verified temporary public preview and explains its lifetime. It works while the local hosted server, tunnel, and computer remain running. After the permanent Render deployment is verified, that file will be updated with its HTTPS address. A repository URL or localhost address is not a shareable website URL.
