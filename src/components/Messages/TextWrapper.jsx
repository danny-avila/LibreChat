import React from 'react';
import Embed from './Embed';
import Highlight from './Highlight';
import regexSplit from '~/utils/regexSplit';
// const codeRegex = /(```[^`]+?```)/g;
const codeRegex = /(```[\s\S]*?```)/g;
const inLineRegex = /(`[^`]+?`)/g;
const matchRegex = /(`[^`]+?`)/g;
const languageMatch = /^```(\w+)/;
const newLineMatch = /^```(\n+)/;
const languages = [
  'java',
  'c',
  'python',
  'c++',
  'javascript',
  'csharp',
  'php',
  'typescript',
  'swift',
  'objectivec',
  'sql',
  'r',
  'kotlin',
  'ruby',
  'go',
  'x86asm',
  'matlab',
  'perl',
  'pascal'
];

const inLineWrap = (parts) =>
  parts.map((part, i) => {
    if (part.match(matchRegex)) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    } else {
      // return <p key={i}>{part}</p>;
      return part;
    }
  });

export default function CodeWrapper({ text }) {
  if (text.includes('```')) {
    // const parts = text.split(codeRegex);
    const parts = regexSplit(text);
    console.log(parts);
    const codeParts = parts.map((part, i) => {
      if (part.match(codeRegex)) {
        let language = 'javascript';

        if (part.match(languageMatch)) {
          language = part.match(languageMatch)[1].toLowerCase();
          const validLanguage = languages.some((lang) => language === lang);
          part = validLanguage ? part.replace(languageMatch, '```') : part;
          language = validLanguage ? language : 'javascript';
        }

        part = part.replace(newLineMatch, '```');

        return (
          <Embed
            key={i}
            language={language}
          >
            <Highlight
              code={part.slice(3, -3)}
              language={language}
            />
          </Embed>
        );
      } else if (part.match(inLineRegex)) {
        const innerParts = part.split(inLineRegex);
        return inLineWrap(innerParts);
      } else {
        return part;
      }
    });

    return <>{codeParts}</>; // return the wrapped text
  } else {
    // map over the parts and wrap any text between tildes with <code> tags
    const parts = text.split(matchRegex);
    const codeParts = inLineWrap(parts);
    return <>{codeParts}</>; // return the wrapped text
  }
}
