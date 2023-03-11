const { ModelOperations } = require('@vscode/vscode-languagedetection');
const languages = require('../utils/languages.js');
const codeRegex = /(```[\s\S]*?```)/g;
// const languageMatch = /```(\w+)/;
const replaceRegex = /```\w+/g;

const detectCode = async (input) => {
  try {
    let text = input;
    if (!text.match(codeRegex)) {
      return text;
    }

    const langMatches = text.match(replaceRegex);

    if (langMatches?.length > 0) {
      langMatches.forEach(match => {
        let lang = match.split('```')[1].trim();

        if (languages.has(lang)) {
          return;
        }

        console.log('[detectCode.js] replacing', match, 'with', '```shell');
        text = text.replace(match, '```shell');
      });

      return text;
    }

    const modelOperations = new ModelOperations();
    const regexSplit = (await import('./regexSplit.mjs')).default;
    const parts = regexSplit(text, codeRegex);

    const output = parts.map(async (part) => {
      if (part.match(codeRegex)) {
        const code = part.slice(3, -3);
        let lang = (await modelOperations.runModel(code))[0].languageId;
        return part.replace(/^```/, `\`\`\`${languages.has(lang) ? lang : 'shell'}`);
      } else {
        return part;
      }
    });

    return (await Promise.all(output)).join('');
  } catch (e) {
    console.log('Error in detectCode function\n', e);
    return text;
  }
};

module.exports = detectCode;
