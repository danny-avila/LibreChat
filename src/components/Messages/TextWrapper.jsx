import React from 'react';
import Markdown from 'markdown-to-jsx';
import Embed from './Embed';
import Highlight from './Highlight';
import regexSplit from '~/utils/regexSplit';
import { languages, wrapperRegex } from '~/utils';
const { codeRegex, inLineRegex, markupRegex, languageMatch, newLineMatch } = wrapperRegex;
const mdOptions = { wrapper: React.Fragment, forceWrapper: true };

const inLineWrap = (parts) => {
  let previousElement = null;
  return parts.map((part, i) => {
    if (part.match(markupRegex)) {
      const codeElement = <code key={i}>{part.slice(1, -1)}</code>;
      if (previousElement && typeof previousElement !== 'string') {
        // Append code element as a child to previous non-code element
        previousElement = (
          <Markdown
            options={mdOptions}
            key={i}
          >
            {previousElement}
            {codeElement}
          </Markdown>
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
  let embedTest = false;

  // to match unenclosed code blocks
  if (text.match(/```/g)?.length === 1) {
  // if (text.match(/```/g)?.length === 1) {
    // const splitString = text.split('```')[1].split(/\s+/).slice(1).join('').trim();
    // embedTest = splitString.length > 0;
    embedTest = true;
  }

  // match enclosed code blocks
  if (text.match(codeRegex)) {
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
        return (
          <Markdown
            options={mdOptions}
            key={i}
          >
            {part}
          </Markdown>
        );
      }
    });

    return <>{codeParts}</>; // return the wrapped text
  } else if (embedTest) {
    const language = text.match(/```(\w+)/)?.[1].toLowerCase() || 'javascript';
    const parts = text.split(text.match(/```(\w+)/)?.[0] || '```');
    const codeParts = parts.map((part, i) => {
      if (i === 1) {
        part = part.replace(/^\n+/, '');

        return (
          <Embed
            key={i}
            language={language}
          >
            <Highlight
              code={part}
              language={language}
            />
          </Embed>
        );
      } else if (part.match(inLineRegex)) {
        const innerParts = part.split(inLineRegex);
        return inLineWrap(innerParts);
      } else {
        return (
          <Markdown
            options={mdOptions}
            key={i}
          >
            {part}
          </Markdown>
        );
      }
    });

    return <>{codeParts}</>; // return the wrapped text
  } else if (text.match(markupRegex)) {
    // map over the parts and wrap any text between tildes with <code> tags
    const parts = text.split(markupRegex);
    const codeParts = inLineWrap(parts);
    return <>{codeParts}</>; // return the wrapped text
  } else {
    return <Markdown options={mdOptions}>{text}</Markdown>;
  }
}
