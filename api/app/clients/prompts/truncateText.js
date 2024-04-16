const MAX_CHAR = 255;

/**
 * Truncates a given text to a specified maximum length, appending ellipsis and a notification
 * if the original text exceeds the maximum length.
 *
 * @param {string} text - The text to be truncated.
 * @param {number} [maxLength=MAX_CHAR] - The maximum length of the text after truncation. Defaults to MAX_CHAR.
 * @returns {string} The truncated text if the original text length exceeds maxLength, otherwise returns the original text.
 */
function truncateText(text, maxLength = MAX_CHAR) {
  if (text.length > maxLength) {
    return `${text.slice(0, maxLength)}... [text truncated for brevity]`;
  }
  return text;
}

/**
 * Truncates a given text to a specified maximum length by showing the first half and the last half of the text,
 * separated by ellipsis. This method ensures the output does not exceed the maximum length, including the addition
 * of ellipsis and notification if the original text exceeds the maximum length.
 *
 * @param {string} text - The text to be truncated.
 * @param {number} [maxLength=MAX_CHAR] - The maximum length of the output text after truncation. Defaults to MAX_CHAR.
 * @returns {string} The truncated text showing the first half and the last half, or the original text if it does not exceed maxLength.
 */
function smartTruncateText(text, maxLength = MAX_CHAR) {
  const ellipsis = '...';
  const notification = ' [text truncated for brevity]';
  const halfMaxLength = Math.floor((maxLength - ellipsis.length - notification.length) / 2);

  if (text.length > maxLength) {
    const startLastHalf = text.length - halfMaxLength;
    return `${text.slice(0, halfMaxLength)}${ellipsis}${text.slice(startLastHalf)}${notification}`;
  }

  return text;
}

module.exports = { truncateText, smartTruncateText };
