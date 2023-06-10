const citationRegex = /\[\^\d+?\^\]/g;

const citeText = (res, noLinks = false) => {
  let result = res.text || res;
  const citations = Array.from(new Set(result.match(citationRegex)));
  if (citations?.length === 0) return result;

  if (noLinks) {
    citations.forEach((citation) => {
      const digit = citation.match(/\d+?/g)[0];
      // result = result.replaceAll(citation, `<sup>[${digit}](#)  </sup>`);
      result = result.replaceAll(citation, `[^${digit}^](#)`);
    });

    return result;
  }

  let sources = res.details.sourceAttributions;
  if (sources?.length === 0) return result;
  sources = sources.map((source) => source.seeMoreUrl);

  citations.forEach((citation) => {
    const digit = citation.match(/\d+?/g)[0];
    result = result.replaceAll(citation, `[^${digit}^](${sources[digit - 1]})`);
    // result = result.replaceAll(citation, `<sup>[${digit}](${sources[digit - 1]})  </sup>`);
  });

  return result;
};

module.exports = citeText;
