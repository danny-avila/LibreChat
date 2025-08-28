/**
 * Converts a base64 string to a buffer.
 * @param {string} base64String
 * @returns {{buffer: Buffer, type: string}}
 */
function base64ToBuffer(base64String) {
  try {
    const typeMatch = base64String.match(/^data:([A-Za-z-+/]+);base64,/);
    const type = typeMatch ? typeMatch[1] : '';
    const base64Data = base64String.replace(/^data:([A-Za-z-+/]+);base64,/, '');
    if (!base64Data) {
      throw new Error('Invalid base64 string');
    }
    return {
      buffer: Buffer.from(base64Data, 'base64'),
      type,
    };
  } catch (error) {
    throw new Error(`Failed to convert base64 to buffer: ${error.message}`);
  }
}

module.exports = { base64ToBuffer };
