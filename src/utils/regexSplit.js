// const string = 'Some text before\n```python\nThis is some `Python` code with ```backticks``` inside the enclosure\n```\nSome text after\n```javascript\nThis is some JavaScript code\n```\n';
const regex = /```([^`\n]*?)\n([\s\S]*?)\n```/g;

export default function regexSplit(string) {
  const matches = [...string.matchAll(regex)];
  const output = [matches[0].input.slice(0, matches[0].index)];

  for (let i = 0; i < matches.length; i++) {
    const [fullMatch, language, code] = matches[i];
    // const formattedCode = code.replace(/`+/g, '\\`');
    const formattedCode = code;
    output.push(`\`\`\`${language}\n${formattedCode}\n\`\`\``);
    if (i < matches.length - 1) {
      const nextText = string.slice(matches[i].index + fullMatch.length, matches[i + 1].index);
      output.push(nextText.trim());
    }
  }

  return output;
}
