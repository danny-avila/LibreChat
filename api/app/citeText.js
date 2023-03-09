/*
// example
const ex = "Fetch API[^1^], Axios[^3^], or XMLHttpRequest[^2^]. Each of these...";
const links = [
  'https://www.freecodecamp.org/news/here-is-the-most-popular-ways-to-make-an-http-request-in-javascript-954ce8c95aaa/',
  'https://stackoverflow.com/questions/247483/http-get-request-in-javascript',
  'https://livecodestream.dev/post/5-ways-to-make-http-requests-in-javascript/'
];

const regex = /\[\^\d+?\^]/g;

const citations = Array.from(new Set(ex.match(regex)));
const linkMap = {};
citations.forEach(citation => {
    const digit = citation.match(/\d+?/g)[0];
    linkMap[citation] = links[digit - 1];
});
*/
const citationRegex = /\[\^\d+?\^]/g;

const citeText = (res) => {
  let sources = res.details.sourceAttributions;
  if (!sources) return res.response;
  sources = sources.map((source) => source.seeMoreUrl);
};

module.exports = citeText;