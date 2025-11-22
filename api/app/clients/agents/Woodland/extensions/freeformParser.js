// Freeform line parser: extracts make, model, deck, rake, optional year
// Usage: const { parseLine } = require('./extensions/freeformParser');
// Non-invasive; regex heuristics only.

const MULTI_WORD_MAKES = [
  'john deere',
  'cub cadet',
  'troy-bilt',
  'troy bilt',
  'agco allis',
];

function normalize(str) {
  return String(str || '').trim();
}

function parseLine(line) {
  const original = String(line || '');
  const lower = original.toLowerCase();
  let make;
  let model;
  let deck;
  let rake;
  let year;

  // Find multi-word make first
  for (const m of MULTI_WORD_MAKES) {
    const idx = lower.indexOf(m);
    if (idx >= 0) {
      make = m
        .split(' ')
        .map((p) => (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)))
        .join(' ')
        .replace('Bilt', 'Bilt');
      const remainder = lower.slice(idx + m.length).trim();
      // Model: first token after make
      const modelMatch = remainder.match(/([a-z0-9-]{2,})/i);
      if (modelMatch) model = modelMatch[1];
      break;
    }
  }

  // If no multi-word match, take first token as make, second as model
  if (!make) {
    const tokens = lower.split(/\s+/).filter(Boolean);
    if (tokens.length) make = tokens[0];
    if (tokens.length > 1) model = tokens[1];
  }

  // Deck size patterns (42, 42", 42in, 42-inch)
  const deckMatch = lower.match(/\b(3[6]|4[2-8]|5[04]|60)(?:\s*(?:inch|in|\"))?\b/);
  if (deckMatch) deck = deckMatch[1];

  // Rake type patterns
  const rakeMap = {
    classic: 'Classic',
    commander: 'Commander',
    'commercial pro': 'Commercial Pro',
    'commercial_pro': 'Commercial Pro',
    xl: 'XL',
    'z-10': 'Z-10',
    z10: 'Z-10',
    crs: 'CRS',
  };
  for (const [key, val] of Object.entries(rakeMap)) {
    if (lower.includes(key)) {
      rake = val;
      break;
    }
  }

  // Year extraction (4-digit between 1990 and current year + 1)
  const currentYear = new Date().getFullYear() + 1;
  const yearMatch = lower.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    const yr = parseInt(yearMatch[1], 10);
    if (yr >= 1990 && yr <= currentYear) year = String(yr);
  }

  return {
    original,
    make: normalize(make),
    model: normalize(model),
    deck: normalize(deck),
    rake: normalize(rake),
    year: normalize(year),
    missing: ['make', 'model', 'rake'].filter((f) => !normalize(eval(f))),
  };
}

module.exports = { parseLine };
