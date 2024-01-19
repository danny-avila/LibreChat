// Regex to check if the processed content contains any potential LaTeX patterns
const containsLatexRegex =
  /\\\(.*?\\\)|\\\[.*?\\\]|\$.*?\$|\\begin\{equation\}.*?\\end\{equation\}/;
// Regex for inline and block LaTeX expressions
const inlineLatex = new RegExp(/\\\((.+?)\\\)/, 'g');
// const blockLatex = new RegExp(/\\\[(.*?)\\\]/, 'gs');
const blockLatex = new RegExp(/\\\[(.*?[^\\])\\\]/, 'gs');

export const processLaTeX = (content: string) => {
  // Escape dollar signs followed by a digit or space and digit
  let processedContent = content.replace(/(\$)(?=\s?\d)/g, '\\$');

  // If no LaTeX patterns are found, return the processed content
  if (!containsLatexRegex.test(processedContent)) {
    return processedContent;
  }

  // Convert LaTeX expressions to a markdown compatible format
  processedContent = processedContent
    .replace(inlineLatex, (match: string, equation: string) => `$${equation}$`) // Convert inline LaTeX
    .replace(blockLatex, (match: string, equation: string) => `$$${equation}$$`); // Convert block LaTeX

  return processedContent;
};
