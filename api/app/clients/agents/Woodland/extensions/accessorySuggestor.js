// Accessory suggestor: recommends upgrade hose/rubber collar when applicable
// Usage: const { suggestAccessories } = require('./accessorySuggestor');
// Returns array of {sku, name, url, reason} for relevant upsells.

/**
 * Suggests upgrade accessories based on fitment data
 * @param {object} doc - Single fitment document from tool result
 * @returns {Array<{sku: string, name: string, url: string, reason: string}>}
 */
function suggestAccessories(doc) {
  const suggestions = [];
  if (!doc?.normalized_compat) return suggestions;

  const oem = doc.normalized_compat.oem || {};
  const aftermarket = doc.normalized_compat.aftermarket || {};

  // Upgrade hose suggestion (if both standard and upgrade exist)
  if (oem.hose && oem.upgrade_hose && oem.upgrade_hose !== oem.hose) {
    suggestions.push({
      sku: oem.upgrade_hose,
      name: `Upgrade Hose (${oem.upgrade_hose})`,
      url: oem.upgrade_hose_url || '',
      reason: 'Enhanced durability and kink resistance',
    });
  } else if (aftermarket.upgrade_hose && aftermarket.upgrade_hose !== aftermarket.hose) {
    suggestions.push({
      sku: aftermarket.upgrade_hose,
      name: `Upgrade Hose (${aftermarket.upgrade_hose})`,
      url: aftermarket.upgrade_hose_url || '',
      reason: 'Enhanced durability and kink resistance',
    });
  }

  // Rubber collar suggestion (always recommend if available)
  if (oem.rubber_collar) {
    suggestions.push({
      sku: oem.rubber_collar,
      name: `Rubber Collar (${oem.rubber_collar})`,
      url: oem.rubber_collar_url || '',
      reason: 'Prevents wear and extends chute life',
    });
  } else if (aftermarket.rubber_collar) {
    suggestions.push({
      sku: aftermarket.rubber_collar,
      name: `Rubber Collar (${aftermarket.rubber_collar})`,
      url: aftermarket.rubber_collar_url || '',
      reason: 'Prevents wear and extends chute life',
    });
  }

  return suggestions;
}

/**
 * Formats accessories as markdown list
 * @param {Array<object>} suggestions - Output from suggestAccessories
 * @returns {string} Markdown formatted list
 */
function formatAccessoryList(suggestions) {
  if (!suggestions.length) return '';
  let md = '\n**🔧 Recommended Accessories:**\n';
  suggestions.forEach((s) => {
    const link = s.url ? `[${s.name}](${s.url})` : s.name;
    md += `- ${link} - ${s.reason}\n`;
  });
  return md;
}

module.exports = { suggestAccessories, formatAccessoryList };
