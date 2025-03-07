const { getUserPluginAuthValue } = require('~/server/services/PluginService');

const loadAuthValues = async ({ userId, authFields, throwError = true }) => {
  let authValues = {};

  /**
   * Finds the first non-empty value for the given authentication field, supporting alternate fields.
   * @param {string[]} fields Array of strings representing the authentication fields. Supports alternate fields delimited by "||".
   * @returns {Promise<{ authField: string, authValue: string} | null>} An object containing the authentication field and value, or null if not found.
   */
  const findAuthValue = async (fields) => {
    for (const field of fields) {
      let value = process.env[field];
      if (value) {
        return { authField: field, authValue: value };
      }
      try {
        value = await getUserPluginAuthValue(userId, field, throwError);
      } catch (err) {
        if (field === fields[fields.length - 1] && !value) {
          throw err;
        }
      }
      if (value) {
        return { authField: field, authValue: value };
      }
    }
    return null;
  };

  for (let authField of authFields) {
    const fields = authField.split('||');
    const result = await findAuthValue(fields);
    if (result) {
      authValues[result.authField] = result.authValue;
    }
  }

  return authValues;
};

module.exports = {
  loadAuthValues,
};
