import React from 'react';
import ReactMarkdown from 'react-markdown';
import supersub from 'remark-supersub'
import Embed from './Embed';
import Highlight from './Highlight';
import regexSplit from '~/utils/regexSplit';
import { languages, wrapperRegex } from '~/utils';
const { codeRegex, inLineRegex, matchRegex, languageMatch, newLineMatch } = wrapperRegex;

// original function
// const inLineWrap = (parts) =>
//   parts.map((part, i) => {
//     if (part.match(matchRegex)) {
//       return <code key={i} >{part.slice(1, -1)}</code>;
//     } else {
//       // return <p key={i}>{part}</p>;
//       // return part;
//       return part.includes('`') ? part : <ReactMarkdown key={i}>{part}</ReactMarkdown>;
//     }
//   });

const inLineWrap = (parts) => {
  let previousElement = null;
  return parts.map((part, i) => {
    if (part.match(matchRegex)) {
      const codeElement = <code key={i}>{part.slice(1, -1)}</code>;
      if (previousElement && typeof previousElement !== 'string') {
        // Append code element as a child to previous non-code element
        previousElement = (
          <ReactMarkdown remarkPlugins={[supersub]} key={i}>
            {previousElement}
            {codeElement}
          </ReactMarkdown>
        );
        return previousElement;
      } else {
        return codeElement;
      }
    } else {
      previousElement = part;
      return previousElement;
    }
  });
};

export default function TextWrapper({ text }) {
  // append triple backticks to the end of the text only if singular found and language found
  if (text.match(/```/g)?.length === 1 && text.match(languageMatch)) {
    text += '```';
  }

  if (text.match(codeRegex)) {
    // if (text.includes('```')) {
    // const parts = text.split(codeRegex);

    const parts = regexSplit(text);
    // console.log(parts);
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
        // return part;
        return <ReactMarkdown remarkPlugins={[supersub]} key={i}>{part}</ReactMarkdown>;
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
