const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const axios = require('axios');
const { chromium } = require('playwright');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const dns = require('dns').promises;
const net = require('net');
const { URL } = require('url');

const PORT = Number.parseInt(process.env.PORT ?? '7001', 10);
const SEARXNG_URL = process.env.SEARXNG_URL ?? 'http://searxng:8080';
const MAX_FETCH_URLS = Number.parseInt(process.env.MAX_FETCH_URLS ?? '10', 10);
const MAX_HTML_BYTES = Number.parseInt(process.env.MAX_HTML_BYTES ?? `${1024 * 1024}`, 10); // 1 MB
const MAX_TEXT_BYTES = Number.parseInt(process.env.MAX_TEXT_BYTES ?? `${200 * 1024}`, 10); // 200 KB
const CACHE_TTL_MS = Number.parseInt(process.env.CACHE_TTL_MS ?? `${10 * 60 * 1000}`, 10);
const NAV_TIMEOUT = Number.parseInt(process.env.PLAYWRIGHT_NAV_TIMEOUT ?? '8000', 10);
const TOTAL_TIMEOUT = Number.parseInt(process.env.TOTAL_TIMEOUT_MS ?? '30000', 10);
const HOST_CONCURRENCY = Number.parseInt(process.env.PER_HOST_CONCURRENCY ?? '2', 10);
const GLOBAL_CONCURRENCY = Number.parseInt(process.env.GLOBAL_CONCURRENCY ?? '6', 10);

const BLOCKED_PROTOCOLS = new Set(['file:', 'ftp:', 'data:', 'ws:', 'wss:', 'mailto:', 'javascript:']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('tiny'));

const fetchCache = new Map();
const hostLimiters = new Map();

const createLimiter = (limit) => {
  const max = Math.max(1, Number.isFinite(limit) ? limit : 1);
  let active = 0;
  const queue = [];

  const next = () => {
    if (active >= max || queue.length === 0) {
      return;
    }

    const { fn, resolve, reject } = queue.shift();
    active += 1;
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        next();
      });
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
};

const globalLimiter = createLimiter(GLOBAL_CONCURRENCY);

let browserInstance = null;

const getBrowser = async () => {
  if (browserInstance) {
    return browserInstance;
  }

  browserInstance = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  return browserInstance;
};

const closeBrowser = async () => {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
};

const isPrivateIPv4 = (ip) => {
  const octets = ip.split('.').map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some(Number.isNaN)) {
    return false;
  }
  const [first, second] = octets;
  if (first === 10) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 169 && second === 254) return true;
  return false;
};

const isPrivateIP = (address, family = 4) => {
  if (!address) {
    return true;
  }
  if (LOOPBACK_HOSTS.has(address)) {
    return true;
  }
  if (family === 4) {
    return isPrivateIPv4(address);
  }
  if (family === 6) {
    return address === '::1' || address.startsWith('fc') || address.startsWith('fd');
  }
  return false;
};

const resolveHost = async (hostname) => {
  const directIP = net.isIP(hostname);
  if (directIP) {
    if (isPrivateIP(hostname, directIP)) {
      throw new Error('private_address');
    }
    return;
  }

  try {
    const records = await dns.lookup(hostname, { all: true });
    if (records.some((record) => isPrivateIP(record.address, record.family))) {
      throw new Error('private_address');
    }
  } catch (error) {
    if (error?.code === 'ENOTFOUND' || error?.code === 'EAI_AGAIN') {
      return;
    }
    if (error?.message === 'private_address') {
      throw error;
    }
  }
};

const validateUrl = async (value) => {
  if (!value || typeof value !== 'string') {
    throw new Error('invalid_url');
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('invalid_url');
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || BLOCKED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error('unsupported_protocol');
  }

  await resolveHost(parsed.hostname);
  return parsed;
};

const truncateByBytes = (text, maxBytes) => {
  if (!text || !Number.isFinite(maxBytes) || maxBytes <= 0) {
    return '';
  }

  let bytes = 0;
  let index = 0;

  while (index < text.length && bytes < maxBytes) {
    const char = text[index];
    const charBytes = Buffer.byteLength(char, 'utf8');
    if (bytes + charBytes > maxBytes) {
      break;
    }
    bytes += charBytes;
    index += 1;
  }

  return text.slice(0, index);
};

const cleanText = (text) => {
  if (!text) {
    return '';
  }
  return text.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
};

const getHostLimiter = (hostname) => {
  if (!hostLimiters.has(hostname)) {
    hostLimiters.set(hostname, createLimiter(HOST_CONCURRENCY));
  }
  return hostLimiters.get(hostname);
};

const fetchWithPlaywright = async (url) => {
  const browser = await getBrowser();
  const context = await browser.newContext({
    javaScriptEnabled: true,
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  });
  context.setDefaultNavigationTimeout(NAV_TIMEOUT);

  const page = await context.newPage();
  let status = 'ok';
  let errorMessage = null;
  let html = '';
  let lang = null;
  let title = '';
  let canonicalUrl = null;

  try {
    await page.route('**/*', (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      if (['image', 'font', 'stylesheet', 'media'].includes(resourceType)) {
        route.abort();
        return;
      }
      route.continue();
    });

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForLoadState('domcontentloaded', { timeout: NAV_TIMEOUT }).catch(() => {});
    lang = await page.locator('html').evaluate((node) => node.getAttribute('lang'));
    title = await page.title();
    html = await page.content();
    canonicalUrl = await page
      .locator('head link[rel="canonical"]')
      .evaluate((node) => node.getAttribute('href'))
      .catch(() => null);
  } catch (error) {
    status = 'error';
    errorMessage = error.message;
  } finally {
    await page.close();
    await context.close();
  }

  return {
    status,
    errorMessage,
    html,
    lang,
    title,
    canonicalUrl,
  };
};

const extractContent = (html, url) => {
  if (!html) {
    return { text: '', title: '', snippet: '' };
  }

  let workingHtml = html;
  const htmlBytes = Buffer.byteLength(workingHtml, 'utf8');
  if (htmlBytes > MAX_HTML_BYTES) {
    workingHtml = truncateByBytes(workingHtml, MAX_HTML_BYTES);
  }

  const dom = new JSDOM(workingHtml, { url });
  const document = dom.window.document;
  document.querySelectorAll('script, style, noscript, iframe').forEach((node) => node.remove());

  const reader = new Readability(document);
  const article = reader.parse();

  const title = article?.title || document.title || url;
  const textContent =
    article?.textContent || cleanText(document.body?.textContent ?? '').slice(0, MAX_TEXT_BYTES);
  const cleanedText = truncateByBytes(cleanText(textContent), MAX_TEXT_BYTES);
  const snippet = truncateByBytes(cleanText(article?.excerpt ?? cleanedText), 600);

  return {
    title,
    text: cleanedText,
    snippet,
  };
};

const getCachedDoc = (url) => {
  const cached = fetchCache.get(url);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    fetchCache.delete(url);
    return null;
  }
  return cached.doc;
};

const setCachedDoc = (url, doc) => {
  fetchCache.set(url, {
    timestamp: Date.now(),
    doc,
  });
};

const fetchUrl = async (url) => {
  const cached = getCachedDoc(url);
  if (cached) {
    return cached;
  }

  const parsed = new URL(url);
  const hostname = parsed.hostname;
  const limiter = getHostLimiter(hostname);

  const result = await globalLimiter(() =>
    limiter(async () => {
      const start = Date.now();
      const { status, errorMessage, html, lang, title, canonicalUrl } = await fetchWithPlaywright(
        url,
      );

      if (status !== 'ok') {
        return {
          url,
          title: title || url,
          text: '',
          snippet: '',
          lang,
          canonicalUrl,
          error: true,
          status,
          message: errorMessage ?? 'Unknown fetch error',
          fetchedAt: new Date().toISOString(),
          elapsedMs: Date.now() - start,
        };
      }

      const extracted = extractContent(html, url);
      const doc = {
        url,
        title: extracted.title || title || url,
        text: extracted.text,
        snippet: extracted.snippet,
        lang,
        canonicalUrl,
        error: false,
        status: 'ok',
        fetchedAt: new Date().toISOString(),
        elapsedMs: Date.now() - start,
      };

      setCachedDoc(url, doc);
      return doc;
    }),
  );

  return result;
};

const tokenize = (text) => {
  if (!text) {
    return [];
  }
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
};

const computeScore = (queryTokens, doc) => {
  if (!doc) {
    return 0;
  }
  const combined = `${doc.title ?? ''} ${doc.snippet ?? ''} ${doc.text ?? ''}`.toLowerCase();
  if (!combined.trim()) {
    return 0;
  }

  const docTokens = tokenize(combined);
  if (docTokens.length === 0) {
    return 0;
  }

  const docTokenCounts = new Map();
  for (const token of docTokens) {
    docTokenCounts.set(token, (docTokenCounts.get(token) ?? 0) + 1);
  }

  let score = 0;
  const uniqueQueryTokens = new Set(queryTokens);

  for (const token of uniqueQueryTokens) {
    const tokenCount = docTokenCounts.get(token) ?? 0;
    if (tokenCount > 0) {
      score += tokenCount;
      if (doc.title?.toLowerCase().includes(token)) {
        score += 2;
      }
      if (doc.snippet?.toLowerCase().includes(token)) {
        score += 1;
      }
    }
  }

  if (score === 0) {
    return 0;
  }

  const lengthPenalty = Math.log10(20 + doc.text.length);
  return Number((score / lengthPenalty).toFixed(4));
};

const mapSearchResults = (results = []) => {
  const response = [];
  let rank = 1;
  for (const item of results) {
    if (!item?.url) {
      continue;
    }
    response.push({
      url: item.url,
      title: item.title ?? item.url,
      snippet: item.content ?? '',
      rank: rank++,
      source: Array.isArray(item.engines) ? item.engines[0] : item.engine ?? null,
      processed: false,
    });
  }
  return response;
};

app.get('/health', async (_req, res) => {
  try {
    await axios.get(`${SEARXNG_URL}/health`, { timeout: 2000 }).catch(() => ({}));
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/search', async (req, res) => {
  const query = (req.query.q ?? '').toString().trim();
  const max = Math.min(Number.parseInt(req.query.max ?? '6', 10) || 6, MAX_FETCH_URLS);
  const safe = Number.parseInt(req.query.safe ?? '1', 10);

  if (!query) {
    res.status(400).json({ error: 'Query is required' });
    return;
  }

  try {
    const searchResponse = await axios.get(`${SEARXNG_URL}/search`, {
      params: {
        q: query,
        format: 'json',
        language: req.query.lang ?? 'en',
        safesearch: safe,
      },
      timeout: 8000,
      headers: {
        'X-Forwarded-For': req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
        'User-Agent': req.get('user-agent') || 'ws-local/1.0',
        Accept: 'application/json',
      },
    });

    const results = mapSearchResults(searchResponse.data?.results ?? []).slice(0, max);
    res.json({
      query,
      safe,
      results,
    });
  } catch (error) {
    res.status(502).json({ error: 'Search provider unavailable' });
  }
});

app.post('/fetch', async (req, res) => {
  const urls = Array.isArray(req.body?.urls) ? [...req.body.urls] : [];
  const maxBytes = Number.parseInt(req.body?.maxBytes ?? `${MAX_TEXT_BYTES}`, 10);

  if (urls.length === 0) {
    res.status(400).json({ error: 'urls must be a non-empty array' });
    return;
  }

  const uniqueUrls = [...new Set(urls)].slice(0, MAX_FETCH_URLS);
  const results = [];

  const startTime = Date.now();

  for (const url of uniqueUrls) {
    if (Date.now() - startTime > TOTAL_TIMEOUT) {
      results.push({
        url,
        status: 'error',
        error: true,
        message: 'timeout',
        text: '',
        snippet: '',
        title: url,
        fetchedAt: new Date().toISOString(),
      });
      continue;
    }

    try {
      const parsed = await validateUrl(url);
      const doc = await fetchUrl(parsed.toString());
      if (doc.text && Buffer.byteLength(doc.text) > maxBytes) {
        doc.text = truncateByBytes(doc.text, maxBytes);
      }
      results.push(doc);
    } catch (error) {
      results.push({
        url,
        status: 'error',
        error: true,
        message: error?.message ?? 'failed',
        text: '',
        snippet: '',
        title: url,
        fetchedAt: new Date().toISOString(),
      });
    }
  }

  res.json({ docs: results });
});

app.post('/rerank', async (req, res) => {
  const query = (req.body?.query ?? '').toString();
  const docs = Array.isArray(req.body?.docs) ? req.body.docs : [];

  if (!query) {
    res.status(400).json({ error: 'query is required' });
    return;
  }

  if (docs.length === 0) {
    res.status(400).json({ error: 'docs must be a non-empty array' });
    return;
  }

  const queryTokens = tokenize(query);
  const scored = docs.map((doc) => ({
    ...doc,
    score: computeScore(queryTokens, doc),
  }));

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  res.json({ docs: scored });
});

const server = app.listen(PORT, () => {
  console.log(`[ws-local] listening on port ${PORT}`);
});

const gracefulShutdown = async () => {
  server.close();
  await closeBrowser();
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
