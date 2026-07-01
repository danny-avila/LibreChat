const path = require('path');
const { loadBrandConfig } = require('@librechat/api');

const brandsDir = path.resolve(__dirname, '..', '..', '..', '..', 'client', 'src', 'brands');

let cached = null;
let loaded = false;

/**
 * Load the active brand config (selected by the `BRAND` env var) once at startup
 * and cache it. Returns `null` when `BRAND` is unset or the config is invalid.
 * @returns {import('librechat-data-provider').TBrandConfig | null}
 */
function getBrandConfig() {
  if (loaded) {
    return cached;
  }
  cached = loadBrandConfig(brandsDir);
  loaded = true;
  return cached;
}

module.exports = { getBrandConfig };
