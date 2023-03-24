const cleanUpPrimaryKeyValue = (value) => {
  // For Bing convoId handling
  return value.replace(/--/g, '|');
};

function replaceSup(text) {
  if (!text.includes('<sup>')) return text;
  const replacedText = text.replace(/<sup>/g, '^').replace(/\s+<\/sup>/g, '^');
  return replacedText;
}

module.exports = {
  cleanUpPrimaryKeyValue,
  replaceSup
};
