// Non-invasive autocomplete cache helper for Tractor agent
// Standalone; does not modify existing LibreChat code.
// Usage: const { buildAutocompleteCache, suggestMakes, suggestModels } = require('./extensions/autocompleteCache');
// Provide recent tool payloads (docs array) to build cache.

const DEFAULT_MAX_ENTRIES = 500;

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function buildAutocompleteCache(docs = [], { maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
  const makes = new Map();
  const modelsByMake = new Map();

  for (const d of docs) {
    const compat = d?.normalized_compat || d?.normalized_catalog?.fitment || {};
    const rawTitle = d?.title || compat?.tractor || '';
    // Expect patterns like "John Deere D130 42 - Classic"; split tokens to identify make & model.
    const tokens = rawTitle.split(/[-–]| /).map((t) => t.trim()).filter(Boolean);
    if (tokens.length < 2) continue;
    // Heuristic: make may be first two tokens if multi-word brand.
    let make = tokens[0];
    let model = tokens[1];
    // Multi-word brand detection
    if (/^(john|cub|troy|agco)$/i.test(tokens[0]) && tokens.length >= 3) {
      make = `${tokens[0]} ${tokens[1]}`;
      model = tokens[2];
    }
    const nMake = normalizeToken(make);
    const nModel = normalizeToken(model);
    if (!nMake || !nModel) continue;

    makes.set(nMake, make);
    if (!modelsByMake.has(nMake)) modelsByMake.set(nMake, new Map());
    const mm = modelsByMake.get(nMake);
    mm.set(nModel, model);
    if (makes.size > maxEntries) break;
  }

  return { makes, modelsByMake, createdAt: Date.now() };
}

function suggestMakes(cache, input, limit = 8) {
  if (!cache?.makes) return [];
  const q = normalizeToken(input);
  const out = [];
  for (const [nMake, display] of cache.makes.entries()) {
    if (!q || nMake.startsWith(q)) out.push(display);
    if (out.length >= limit) break;
  }
  return out;
}

function suggestModels(cache, make, partial, limit = 10) {
  if (!cache?.modelsByMake) return [];
  const nMake = normalizeToken(make);
  const q = normalizeToken(partial);
  const mm = cache.modelsByMake.get(nMake);
  if (!mm) return [];
  const out = [];
  for (const [nModel, display] of mm.entries()) {
    if (!q || nModel.startsWith(q)) out.push(display);
    if (out.length >= limit) break;
  }
  return out;
}

module.exports = {
  buildAutocompleteCache,
  suggestMakes,
  suggestModels,
};
