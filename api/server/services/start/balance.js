const { removeNullishValues } = require('librechat-data-provider');

/**
 * Loads the default balance configuration.
 * @param {TCustomConfig | undefined} config - The loaded custom configuration.
 * @param {TConfigDefaults} configDefaults - The custom configuration default values.
 * @returns {TCustomConfig['balance']} The default balance object.
 */
async function loadDefaultBalance(config, configDefaults) {
  const { balance: balanceConfig } = config ?? {};
  const { balance: defaults } = configDefaults;

  /** @type {TCustomConfig['balance']} */
  const loadedBalance = removeNullishValues({
    enabled: balanceConfig?.enabled ?? defaults.enabled,
    startBalance: balanceConfig?.startBalance ?? defaults.startBalance,
    autoRefillEnabled: balanceConfig?.autoRefillEnabled ?? defaults.autoRefillEnabled,
    refillIntervalValue: balanceConfig?.refillIntervalValue ?? defaults.refillIntervalValue,
    refillIntervalUnit: balanceConfig?.refillIntervalUnit ?? defaults.refillIntervalUnit,
    refillAmount: balanceConfig?.refillAmount ?? defaults.refillAmount,
  });

  return loadedBalance;
}

module.exports = { loadDefaultBalance };
