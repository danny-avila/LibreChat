/**
 * Hitch Relevance Classification
 * Determines which product categories require hitch type filtering.
 * Categories are normalized to lowercase underscores.
 */

const HITCH_RELEVANT_PARTS = new Set([
  'hitch',
  'hitch_assembly',
  'wheels',
  'wheel_assembly',
  'deck_hose',
  'deck_hose_assembly',
  'mda',
  'mower_deck_adapter',
  'chassis',
  'axle',
  'rake_assembly',
  'complete_rake',
  'frame',
  'side_tubes',
]);

const HITCH_AGNOSTIC_PARTS = new Set([
  'impeller',
  'impeller_assembly',
  'blower_housing',
  'engine',
  'engine_assembly',
  'bag',
  'collector_bag',
  'filter',
  'air_filter',
  'maintenance_kit',
  'bolt',
  'nut',
  'washer',
  'hardware',
  'belt',
  'pulley',
  'bearing',
]);

function normalizeCategory(cat) {
  return String(cat || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Check if part category requires hitch type validation.
 * @param {string} category - Primary product category.
 * @param {string[]} categories - All categories array.
 * @returns {boolean} true if hitch type is relevant.
 */
function isHitchRelevant(category, categories = []) {
  const all = [category, ...(categories || [])]
    .filter(Boolean)
    .map(normalizeCategory);

  if (all.some((c) => HITCH_AGNOSTIC_PARTS.has(c))) {
    return false; // Explicitly agnostic wins.
  }
  if (all.some((c) => HITCH_RELEVANT_PARTS.has(c))) {
    return true; // Explicitly relevant.
  }
  return false; // Default: no hitch filtering unless explicitly relevant.
}

/**
 * Extract category from a catalog document.
 * @param {object} doc - Raw or normalized catalog doc.
 * @returns {string|null}
 */
function extractCategory(doc) {
  if (!doc) return null;
  return (
    doc.normalized_catalog?.categories?.[0] ||
    doc.category ||
    doc.product_category ||
    null
  );
}

module.exports = {
  HITCH_RELEVANT_PARTS,
  HITCH_AGNOSTIC_PARTS,
  isHitchRelevant,
  extractCategory,
};
