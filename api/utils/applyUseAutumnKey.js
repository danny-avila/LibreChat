const normalizeBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value == null) {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  return false;
};

const applyUseAutumnKey = (env = process.env) => {
  if (!env || env.USEAUTUMN_KEY) {
    return;
  }

  const useProduction = normalizeBoolean(env.IS_USEAUTUMN_PROD);
  const sandboxKey = env.USEAUTUMN_SANDBOX_KEY;
  const productionKey = env.USEAUTUMN_PROD_KEY;

  if (useProduction && productionKey) {
    env.USEAUTUMN_KEY = productionKey;
    return;
  }

  if (!useProduction && sandboxKey) {
    env.USEAUTUMN_KEY = sandboxKey;
  }
};

module.exports = applyUseAutumnKey;
