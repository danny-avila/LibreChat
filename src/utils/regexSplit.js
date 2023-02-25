const regex = /```([^`\n]*?)\n([\s\S]*?)\n```/g;

const unenclosedCodeTest = (text) => {
  let workingText = text;
  // if (workingText.startsWith('<') || (!workingText.startsWith('`') && workingText.match(/```/g)?.length === 1)) {
  //   workingText = `\`\`\`${workingText}`
  // }

  return workingText.trim();
};

export default function regexSplit(string) {
  const matches = [...string.matchAll(regex)];
  const output = [matches[0].input.slice(0, matches[0].index)];

  // console.log(matches);

  for (let i = 0; i < matches.length; i++) {
    const [fullMatch, language, code] = matches[i];
    // const formattedCode = code.replace(/`+/g, '\\`');
    output.push(`\`\`\`${language}\n${code}\n\`\`\``);
    if (i < matches.length - 1) {
      let nextText = string.slice(matches[i].index + fullMatch.length, matches[i + 1].index);
      nextText = unenclosedCodeTest(nextText);
      output.push(nextText);
    } else {
      const lastMatch = matches[matches.length - 1][0];
      // console.log(lastMatch);
      // console.log(matches[0].input.split(lastMatch));
      let rest = matches[0].input.split(lastMatch)[1]

      if (rest) {
        rest = unenclosedCodeTest(rest);
        output.push(rest);
      }
    }
  }

  return output;
}
