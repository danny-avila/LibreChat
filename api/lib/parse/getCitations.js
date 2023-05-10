const regex = / \[.*?]\(.*?\)/g;

const getCitations = (res) => {
  const textBlocks = res.details.adaptiveCards[0].body;
  if (!textBlocks) return '';
  let links = textBlocks[textBlocks.length - 1]?.text.match(regex);
  if (!links.length) return '';
  links = links.map((link) => link);
  return links.join('\n');
};

module.exports = getCitations;
