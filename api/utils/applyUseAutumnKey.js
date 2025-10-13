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
  const result = {
    active: Boolean(env?.USEAUTUMN_KEY),
    derived: false,
    source: null,
    isProduction: normalizeBoolean(env?.IS_USEAUTUMN_PROD),
    sandboxKeyPresent: Boolean(env?.USEAUTUMN_SANDBOX_KEY),
    productionKeyPresent: Boolean(env?.USEAUTUMN_PROD_KEY),
  };

  if (!env) {
    return result;
  }

  if (result.active) {
    if (env.USEAUTUMN_KEY === env.USEAUTUMN_PROD_KEY) {
      result.source = 'production';
    } else if (env.USEAUTUMN_KEY === env.USEAUTUMN_SANDBOX_KEY) {
      result.source = 'sandbox';
    } else {
      result.source = 'explicit';
    }

    return result;
  }

  const sandboxKey = env.USEAUTUMN_SANDBOX_KEY;
  const productionKey = env.USEAUTUMN_PROD_KEY;

  if (result.isProduction && productionKey) {
    env.USEAUTUMN_KEY = productionKey;
    result.active = true;
    result.derived = true;
    result.source = 'production';
    return result;
  }

  if (!result.isProduction && sandboxKey) {
    env.USEAUTUMN_KEY = sandboxKey;
    result.active = true;
    result.derived = true;
    result.source = 'sandbox';
  }

  return result;
};

module.exports = applyUseAutumnKey;
