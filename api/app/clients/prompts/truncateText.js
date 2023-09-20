const MAX_CHAR = 255;

function truncateText(text) {
  if (text.length > MAX_CHAR) {
    return `${text.slice(0, MAX_CHAR)}... [text truncated for brevity]`;
  }
  return text;
}

module.exports = truncateText;
