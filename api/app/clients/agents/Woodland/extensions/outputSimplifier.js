// Output simplifier: CRM line generator, tiered view, flag coloring
// Usage: const { buildCRMLine, buildTieredOutput, colorizeFlags } = require('./extensions/outputSimplifier');

function buildCRMLine({ make, model, deck, rake }, parts = {}) {
  const fields = [make, model, deck ? deck + '"' : null, rake].filter(Boolean).join(' ');
  const skuBits = [parts.mda, parts.hitch, parts.hose].filter(Boolean).join(' | ');
  return `${fields}: ${skuBits}`.trim();
}

function colorizeFlags(flags = {}) {
  const map = {};
  Object.entries(flags).forEach(([k, v]) => {
    const val = v === true ? 'Yes' : v === false ? 'No' : 'Unknown';
    const emoji = v === true ? '🟢' : v === false ? '🔴' : '⚪';
    map[k] = `${emoji} ${val}`;
  });
  return map;
}

function buildTieredOutput(parts = {}, flags = {}, { showAdvanced = false } = {}) {
  const lines = [];
  lines.push(`MDA: ${parts.mda || 'N/A'}`);
  lines.push(`Hitch: ${parts.hitch || 'N/A'}`);
  lines.push(`Hose: ${parts.hose || 'N/A'}`);
  if (parts.rubber_collar) lines.push(`Rubber Collar: ${parts.rubber_collar}`);
  if (parts.upgrade_hose) lines.push(`Upgrade Hose: ${parts.upgrade_hose}`);
  if (showAdvanced) {
    const colored = colorizeFlags(flags);
    Object.entries(colored).forEach(([k, v]) => lines.push(`${k}: ${v}`));
  }
  return lines.join('\n');
}

module.exports = { buildCRMLine, buildTieredOutput, colorizeFlags };
