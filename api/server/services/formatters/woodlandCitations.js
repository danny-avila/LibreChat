// Simple citation builder for Woodland results
// Returns URLs exactly as present in the search document payload.
// Optional: if WOODLAND_CITATIONS_URL_ALLOWLIST is set (comma-separated hosts),
// only URLs whose hostname matches the allowlist (or its subdomains) are returned.

const rawAllow = (process.env.WOODLAND_CITATIONS_URL_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
const allowSet = new Set(rawAllow);

function isAllowed(u) {
  if (allowSet.size === 0) return true; // pass-through when no allowlist configured
  try {
    const url = new URL(u);
    const host = url.hostname.toLowerCase();
    for (const d of allowSet) {
      const dd = d.toLowerCase();
      if (host === dd || host.endsWith('.' + dd)) return true;
    }
    return false;
  } catch (_) { return false; }
}

function urlFromHit(hit) {
  const u = hit?.url;
  if (typeof u !== 'string' || !u) return undefined;
  if (!isAllowed(u)) return undefined;
  return u;
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
  urlFromHit,
  shortSummary,
  classifySource,
  buildCitations,
};
