const regex = /```([^`\n]*?)\n([\s\S]*?)\n```/g;

export default function regexSplit(string) {
  const matches = [...string.matchAll(regex)];
  const output = [matches[0].input.slice(0, matches[0].index)];

  for (let i = 0; i < matches.length; i++) {
    const [fullMatch, language, code] = matches[i];
    // const formattedCode = code.replace(/`+/g, '\\`');
    output.push(`\`\`\`${language}\n${code}\n\`\`\``);
    if (i < matches.length - 1) {
      const nextText = string.slice(matches[i].index + fullMatch.length, matches[i + 1].index);
      output.push(nextText.trim());
    }
  }

  return output;
}
