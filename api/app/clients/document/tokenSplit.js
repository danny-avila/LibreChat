const { TokenTextSplitter } = require('@langchain/textsplitters');

/**
 * Splits a given text by token chunks, based on the provided parameters for the TokenTextSplitter.
 * Note: limit or memoize use of this function as its calculation is expensive.
 *
 * @param {Object} obj - Configuration object for the text splitting operation.
 * @param {string} obj.text - The text to be split.
 * @param {string} [obj.encodingName='cl100k_base'] - Encoding name. Defaults to 'cl100k_base'.
 * @param {number} [obj.chunkSize=1] - The token size of each chunk. Defaults to 1.
 * @param {number} [obj.chunkOverlap=0] - The number of chunk elements to be overlapped between adjacent chunks. Defaults to 0.
 * @param {number} [obj.returnSize] - If specified and not 0, slices the return array from the end by this amount.
 *
 * @returns {Promise<Array>} Returns a promise that resolves to an array of text chunks.
 * If no text is provided, an empty array is returned.
 * If returnSize is specified and not 0, slices the return array from the end by returnSize.
 *
 * @async
 * @function tokenSplit
 */
async function tokenSplit({
  text,
  encodingName = 'cl100k_base',
  chunkSize = 1,
  chunkOverlap = 0,
  returnSize,
}) {
  if (!text) {
    return [];
  }

  const splitter = new TokenTextSplitter({
    encodingName,
    chunkSize,
    chunkOverlap,
  });

  if (!returnSize) {
    return await splitter.splitText(text);
  }

  const splitText = await splitter.splitText(text);

  if (returnSize && returnSize > 0 && splitText.length > 0) {
    return splitText.slice(-Math.abs(returnSize));
  }

  return splitText;
}

module.exports = tokenSplit;
