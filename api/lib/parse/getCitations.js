// const regex = / \[\d+\..*?\]\(.*?\)/g;
const regex = / \[.*?]\(.*?\)/g;

const getCitations = (res) => {
  const adaptiveCards = res.details.adaptiveCards;
  const textBlocks = adaptiveCards && adaptiveCards[0].body;
  if (!textBlocks) return '';
  let links = textBlocks[textBlocks.length - 1]?.text.match(regex);
  if (links?.length === 0 || !links) return '';
  links = links.map(link => link.trim());
  return links.join('\n');
};

module.exports = getCitations;
