/**
 * Evaluates a mathematical expression provided as a string and returns the result.
 *
 * If the input is already a number, it returns the number as is.
 * If the input is not a string or contains invalid characters, an error is thrown.
 * If the evaluated result is not a number, an error is thrown.
 *
 * @param {string|number} str - The mathematical expression to evaluate, or a number.
 *
 * @returns {number} The result of the evaluated expression or the input number.
 *
 * @throws {Error} Throws an error if the input is not a string or number, contains invalid characters, or does not evaluate to a number.
 */
function math(str) {
  if (typeof str !== 'string' && typeof str === 'number') {
    return str;
  } else if (typeof str !== 'string') {
    throw new Error(`str is ${typeof str}, but should be a string`);
  }

  const validStr = /^[+\-\d.\s*/%()]+$/.test(str);

  if (!validStr) {
    throw new Error('Invalid characters in string');
  }

  const value = eval(str);

  if (typeof value !== 'number') {
    console.error('str', str);
    throw new Error(`str did not evaluate to a number but to a ${typeof value}`);
  }

  return value;
}

module.exports = math;
