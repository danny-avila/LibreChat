import React from 'react';
// import ReactMarkdown from 'react-markdown';
// import supersub from 'remark-supersub'
import Markdown from 'markdown-to-jsx';
import Embed from './Embed';
import Highlight from './Highlight';
import regexSplit from '~/utils/regexSplit';
import { languages, wrapperRegex } from '~/utils';
const { codeRegex, inLineRegex, matchRegex, languageMatch, newLineMatch } = wrapperRegex;
const mdOptions = { wrapper: React.Fragment, forceWrapper: true };


const inLineWrap = (parts) => {
  let previousElement = null;
  return parts.map((part, i) => {
    if (part.match(matchRegex)) {
      const codeElement = <code key={i}>{part.slice(1, -1)}</code>;
      if (previousElement && typeof previousElement !== 'string') {
        // Append code element as a child to previous non-code element
        previousElement = (
          // <ReactMarkdown remarkPlugins={[supersub]} key={i}>
          <Markdown options={mdOptions} key={i}>
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
  // append triple backticks to the end of the text only if singular found and language found
  if (text.match(/```/g)?.length === 1 && text.match(languageMatch)) {
    text += '\n```';
  }

  if (text.match(codeRegex)) {
    const parts = regexSplit(text);
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
        // return <ReactMarkdown remarkPlugins={[supersub]} key={i}>{part}</ReactMarkdown>;
        return <Markdown options={mdOptions} key={i}>{part}</Markdown>
      }
    });

    return <>{codeParts}</>; // return the wrapped text
  } else if (text.match(matchRegex)) {
    // map over the parts and wrap any text between tildes with <code> tags
    const parts = text.split(matchRegex);
    const codeParts = inLineWrap(parts);
    return <>{codeParts}</>; // return the wrapped text
  } else {
    // return <ReactMarkdown  remarkPlugins={[supersub]}>{text}</ReactMarkdown>;
    // return text
    return <Markdown options={mdOptions}>{text}</Markdown>;
  }
}
