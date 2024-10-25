const citationRegex = /\[\^\d+?\^\]/g;
const regex = / \[.*?]\(.*?\)/g;

/** Helper function to escape special characters in regex
 * @param {string} string - The string to escape.
 * @returns {string} The escaped string.
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const getCitations = (res) => {
  const adaptiveCards = res.details.adaptiveCards;
  const textBlocks = adaptiveCards && adaptiveCards[0].body;
  if (!textBlocks) {
    return '';
  }
  let links = textBlocks[textBlocks.length - 1]?.text.match(regex);
  if (links?.length === 0 || !links) {
    return '';
  }
  links = links.map((link) => link.trim());
  return links.join('\n - ');
};

const citeText = (res, noLinks = false) => {
  let result = res.text || res;
  const citations = Array.from(new Set(result.match(citationRegex)));
  if (citations?.length === 0) {
    return result;
  }

  if (noLinks) {
    citations.forEach((citation) => {
      const digit = citation.match(/\d+?/g)[0];
      // result = result.replaceAll(citation, `<sup>[${digit}](#)  </sup>`);
      result = result.replaceAll(citation, `[^${digit}^](#)`);
    });

    return result;
  }

  let sources = res.details.sourceAttributions;
  if (sources?.length === 0) {
    return result;
  }
  sources = sources.map((source) => source.seeMoreUrl);

  citations.forEach((citation) => {
    const digit = citation.match(/\d+?/g)[0];
    result = result.replaceAll(citation, `[^${digit}^](${sources[digit - 1]})`);
    // result = result.replaceAll(citation, `<sup>[${digit}](${sources[digit - 1]})  </sup>`);
  });

  return result;
};

module.exports = { getCitations, citeText, escapeRegExp };
