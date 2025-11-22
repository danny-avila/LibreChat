// Deck width selector helper: derives candidate widths from tool docs
// Usage: const { deriveDeckOptions } = require('./extensions/deckWidthSelector');

function deriveDeckOptions(docs = []) {
  const widths = new Set();
  for (const d of docs) {
    const title = String(d?.title || '').toLowerCase();
    // Extract width tokens (36, 42, 46, 48, 54, 60)
    const match = title.match(/\b(3[6]|4[2-68]|5[04]|60)\b/);
    if (match) widths.add(match[1]);
  }
  // Sort numeric ascending
  const ordered = Array.from(widths).sort((a, b) => Number(a) - Number(b));
  return ordered;
}

module.exports = { deriveDeckOptions };
