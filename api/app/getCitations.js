// const regex = / \[\d+\..*?\]\(.*?\)/g;
const regex = / \[.*?]\(.*?\)/g;

const getCitations = (res) => {
  const textBlocks = res.details.adaptiveCards[0].body;
  if (!textBlocks) return '';
  let links = textBlocks[textBlocks.length - 1]?.text.match(regex);
  if (links?.length === 0 || !links) return '';
  links = links.map((link) => '- ' + link.trim());
  return 'Learn more:\n' + links.join('\n');
};

module.exports = getCitations;