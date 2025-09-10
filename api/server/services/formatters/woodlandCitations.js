// Strict citation builder for Woodland results
// - Uses only URL fields present in the payload (never constructs URLs)
// - Applies allow-list filtering for hosts

const allowList = new Set([
  'airtable.com',
  // Base domain covers website and subdomains such as support.cyclonerake.com
  'cyclonerake.com',
  // Kept for back-compat; optional explicit subdomain entry
  'support.cyclonerake.com',
]);

function isAllowedUrl(u) {
  try {
    const url = new URL(u);
    const proto = url.protocol.toLowerCase();
    if (proto !== 'http:' && proto !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    for (const d of allowList) {
      if (host === d || host.endsWith('.' + d)) return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

// Extracts the first allowed URL found in a block of text
function extractAllowedUrl(text) {
  if (typeof text !== 'string' || !text) return undefined;
  // Basic http/https URL matcher
  const urlRegex = /(https?:\/\/[^\s)]+)[)\]\s]?/gi;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    const candidate = match[1];
    if (isAllowedUrl(candidate)) return candidate;
  }
  return undefined;
}

function urlFromHit(hit) {
  const u = hit?.url;
  if (typeof u === 'string' && u && isAllowedUrl(u)) return u;
  // Fallback: scan chunk/text/snippet for the first allowed URL
  return (
    extractAllowedUrl(hit?.chunk) ||
    extractAllowedUrl(hit?.text) ||
    extractAllowedUrl(hit?.snippet) ||
    undefined
  );
}

function shortSummary(hit) {
  const t = (hit?.title || '').trim();
  if (t) return t;
  const c = (hit?.chunk || hit?.text || hit?.snippet || '').trim();
  return c ? (c.length > 160 ? c.slice(0, 157) + '…' : c) : 'Untitled';
}

function classifySource(hit) {
  const source = (hit?.source || '').toLowerCase();
  if (source === 'airtable') return 'airtable';
  const u = hit?.url || '';
  try {
    const host = new URL(u).hostname.toLowerCase();
    if (host.includes('airtable.com')) return 'airtable';
    if (host.includes('support.cyclonerake.com')) return 'cyclopedia';
    if (host.includes('cyclonerake.com')) return 'website';
  } catch (_) {}
  return 'other';
}

function buildCitations({ airtable = [], cyclopedia = [], website = [] }) {
  const lines = ['Citations:'];

  const airLines = airtable.map((h) => {
    const id = (h?.record_id || h?.id || '').toString().trim();
    const desc = shortSummary(h);
    const url = urlFromHit(h);
    return url ? `${id ? id + ' – ' : ''}${desc} (${url})` : `${id ? id + ' – ' : ''}${desc}`;
  });
  lines.push('Airtable:');
  if (airLines.length) lines.push(...airLines); else lines.push('none');

  const cycLines = cyclopedia.map((h) => {
    const desc = shortSummary(h);
    const url = urlFromHit(h);
    return url ? `${desc} (${url})` : desc;
  });
  lines.push('Cyclopedia:');
  if (cycLines.length) lines.push(...cycLines); else lines.push('none');

  const webLines = website.map((h) => {
    const desc = shortSummary(h);
    const url = urlFromHit(h);
    return url ? `${desc} (${url})` : desc;
  });
  lines.push('Website:');
  if (webLines.length) lines.push(...webLines); else lines.push('none');

  return lines.join('\n');
}

module.exports = {
  isAllowedUrl,
  extractAllowedUrl,
  urlFromHit,
  shortSummary,
  classifySource,
  buildCitations,
};
