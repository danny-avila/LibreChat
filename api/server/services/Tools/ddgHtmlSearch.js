/**
 * DuckDuckGo HTML search provider — no API key.
 * Uses https://html.duckduckgo.com/html/?q= (NOT lite.duckduckgo.com/lite/ / api.duckduckgo.com)
 * Parses no-JS result page via regex (no cheerio dep) and unwraps //duckduckgo.com/l/?uddg= links.
 * Returns shape compatible with @librechat/agents search `getSources` -> { success, data: { organic, topStories, ... } }
 */
let axios;
try { axios = require('axios'); } catch {}
// Lazy axios — parseHtml works without it (tests)

const ENDPOINT = 'https://html.duckduckgo.com/html/';
const TIMEOUT = 10000;
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';

function decodeHtml(s) {
  if (!s) return '';
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/');
}
function stripTags(s) {
  if (!s) return '';
  return s.replace(/<[^>]+>/g, '');
}
function unwrapDdgUrl(href) {
  if (!href) return '';
  let h = href.replace(/&amp;/g, '&');
  const idx = h.indexOf('uddg=');
  if (idx >= 0) {
    let sub = h.slice(idx + 5);
    const amp = sub.indexOf('&');
    if (amp >= 0) sub = sub.slice(0, amp);
    try {
      return decodeURIComponent(sub);
    } catch {
      return sub;
    }
  }
  if (h.startsWith('//')) h = 'https:' + h;
  return h;
}

function parseHtml(html, limit = 5) {
  const out = [];
  if (!html) return out;
  const parts = html.split('<div class="result');
  for (let i = 1; i < parts.length && out.length < limit; i++) {
    const block = '<div class="result' + parts[i];
    // title link: <a class="result__a" href="...">Title</a>
    const tm = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!tm) continue;
    const rawHref = tm[1];
    const rawTitle = tm[2];
    const url = unwrapDdgUrl(rawHref.trim());
    let title = stripTags(decodeHtml(rawTitle)).trim().replace(/\s+/g, ' ');
    if (!title) title = url;

    // snippet: <a class="result__snippet">...</a> or class="result__snippet"
    let snippet = '';
    let sm = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (sm) {
      snippet = stripTags(decodeHtml(sm[1])).trim().replace(/\s+/g, ' ');
    } else {
      const sm2 = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|span|div)>/i);
      if (sm2) snippet = stripTags(decodeHtml(sm2[1])).trim().replace(/\s+/g, ' ');
    }
    if (!url) continue;
    let attribution = '';
    try {
      attribution = new URL(url).hostname;
    } catch {
      attribution = '';
    }
    out.push({
      position: out.length + 1,
      title,
      link: url,
      snippet,
      attribution,
    });
  }
  return out;
}

/**
 * Factory matching createSearchAPI signature but for DDG HTML.
 * @param {object} agents - { httpAgent, httpsAgent } for SSRF-safe agents
 */
function createDdgHtmlAPI(agents) {
  const getSources = async ({ query, numResults = 5, safeSearch }) => {
    if (!query || !query.trim()) {
      return { success: false, error: 'Query cannot be empty' };
    }
    if (!axios) { try { axios = require('axios'); } catch { return { success: false, error: 'axios not available' }; } }
    const n = Math.max(1, Math.min(10, numResults));
    const encoded = encodeURIComponent(query.trim());
    const url = `${ENDPOINT}?q=${encoded}`;

    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: TIMEOUT,
        httpAgent: agents?.httpAgent,
        httpsAgent: agents?.httpsAgent,
        // html.duckduckgo.com returns 200 even with no results
        validateStatus: (s) => s >= 200 && s < 400,
      });
      if (!axios) { try { axios = require('axios'); } catch (e) { return { success: false, error: 'axios not installed' }; } }
      const html = res.data;
      const organic = parseHtml(html, n);
      // safeSearch param is ignored by HTML endpoint (it respects its own &kp= param, but keep for compat)
      // We don't implement kp mapping to avoid breaking existing behavior; moderate is default.
      return {
        success: true,
        data: {
          organic,
          images: [],
          topStories: [],
          relatedSearches: [],
          videos: [],
          news: [],
          places: [],
          shopping: [],
          peopleAlsoAsk: [],
          knowledgeGraph: undefined,
          answerBox: undefined,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `DDG HTML search failed: ${err.message || String(err)}`,
      };
    }
  };
  return { getSources };
}

module.exports = {
  ENDPOINT,
  createDdgHtmlAPI,
  parseHtml,
  unwrapDdgUrl,
  stripTags,
  decodeHtml,
};
