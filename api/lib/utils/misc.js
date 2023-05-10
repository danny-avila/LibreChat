const cleanupPrimaryKeyValue = (value) => {
  // Replaces double dash with a vertical bar for Bing convoId handling
  return value.replace(/--/g, '|');
};

function replaceSupTag(text) {
  // Replaces HTML superscript tags with caret character
  if (!text.includes('<sup>')) return text;
  const replacedText = text.replace(/<sup>/g, '^').replace(/\s+<\/sup>/g, '^');
  return replacedText;
}

module.exports = {
  cleanupPrimaryKeyValue,
  replaceSupTag
};
