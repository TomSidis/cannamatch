/**
 * File:        api/lib/webSearch.js
 * Purpose:     Free multi-source web search, priority chain:
 *                1. DuckDuckGo Instant Answers  (no key, no auth, always free)
 *                2. Brave Search API            (env: BRAVE_SEARCH_KEY — free 1k/mo tier)
 *                3. Google Custom Search        (env: GOOGLE_CSE_KEY + GOOGLE_CSE_CX — 100/day free)
 *                4. SerpAPI                     (env: SERPAPI_KEY — fallback paid)
 *              Returns: Array<{ title, snippet, url }> — empty array if all fail.
 */

const TIMEOUT_MS = 7_000;

/**
 * DuckDuckGo Instant Answers — no API key required.
 * Returns limited results (abstract + related topics) but is always available.
 */
async function duckDuckGo(query) {
  try {
    const url =
      'https://api.duckduckgo.com/?' +
      `q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;

    const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!resp.ok) return [];

    const data   = await resp.json();
    const results = [];

    if (data.AbstractText?.trim()) {
      results.push({
        title:   data.AbstractSource || 'DuckDuckGo',
        snippet: data.AbstractText.slice(0, 400),
        url:     data.AbstractURL || '',
      });
    }

    (data.RelatedTopics || []).slice(0, 4).forEach((t) => {
      if (t.Text?.trim()) {
        results.push({
          title:   t.Name || 'מידע קשור',
          snippet: t.Text.slice(0, 300),
          url:     t.FirstURL || '',
        });
      }
    });

    return results;
  } catch {
    return [];
  }
}

/**
 * Brave Search API — free tier at search.brave.com/api
 * Env: BRAVE_SEARCH_KEY
 * Returns real web results with summaries.
 */
async function braveSearch(query) {
  const key = process.env.BRAVE_SEARCH_KEY;
  if (!key) return [];
  try {
    const url =
      'https://api.search.brave.com/res/v1/web/search?' +
      `q=${encodeURIComponent(query)}&count=5&country=IL&search_lang=he&ui_lang=he`;

    const resp = await fetch(url, {
      headers: {
        'Accept':              'application/json',
        'Accept-Encoding':     'gzip',
        'X-Subscription-Token': key,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) return [];

    const data = await resp.json();
    return (data.web?.results || []).slice(0, 4).map((r) => ({
      title:   r.title,
      snippet: r.description || r.extra_snippets?.[0] || '',
      url:     r.url,
    }));
  } catch {
    return [];
  }
}

/**
 * Google Custom Search Engine — 100 free queries/day
 * Env: GOOGLE_CSE_KEY, GOOGLE_CSE_CX
 */
async function googleCSE(query) {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx  = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) return [];
  try {
    const url =
      'https://www.googleapis.com/customsearch/v1?' +
      `key=${key}&cx=${cx}&q=${encodeURIComponent(query)}&num=4&hl=iw&gl=il`;

    const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!resp.ok) return [];

    const data = await resp.json();
    return (data.items || []).slice(0, 4).map((item) => ({
      title:   item.title,
      snippet: item.snippet,
      url:     item.link,
    }));
  } catch {
    return [];
  }
}

/**
 * webSearch(query) → Promise<Array<{ title, snippet, url }>>
 *
 * Tries each provider in priority order, returns first non-empty result set.
 * Never throws. Returns [] if everything fails.
 */
export async function webSearch(query) {
  // Fire DuckDuckGo immediately (always available); try Brave in parallel if key exists
  const [ddg, brave, google] = await Promise.all([
    duckDuckGo(query),
    braveSearch(query),
    googleCSE(query),
  ]);

  // Prefer Brave (real web results) → Google CSE → DDG
  if (brave.length)  return brave;
  if (google.length) return google;
  if (ddg.length)    return ddg;
  return [];
}
