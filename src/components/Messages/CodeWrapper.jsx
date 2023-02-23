import React from 'react';
import Embed from './Embed';
import hljs from 'highlight.js';
import Highlight from 'react-highlight';

export default function CodeWrapper({ text }) {
  if (text.includes('```')) {
    const codeRegex = /(```[^`]+?```)/g;
    const inLineRegex = /(`[^`]+?`)/g;
    const parts = text.split(codeRegex);
    // console.log(parts);
    const codeParts = parts.map((part, i) => {
      if (part.match(codeRegex)) {
        return (
          <Embed
            key={i}
            language="javascript"
          >
            {hljs.highlightAuto(part.slice(1, -1)).value}
            {/* <Highlight className="!whitespace-pre">{part.slice(1, -1)}</Highlight> */}

          </Embed>
        );
      } else if (part.match(inLineRegex)) {
        const innerParts = part.split(inLineRegex);
        return innerParts.map((part, i) => {
          if (part.match(inLineRegex)) {
            return <code key={i}>{part.slice(1, -1)}</code>;
          } else {
            return part;
          }
        });
      } else {
        return part;
      }
    });

    return <>{codeParts}</>; // return the wrapped text
  } else {
    const matchRegex = /(`[^`]+?`)/g;
    const parts = text.split(matchRegex);
    // console.log('parts', parts);

    // map over the parts and wrap any text between tildes with <code> tags
    const codeParts = parts.map((part, i) => {
      if (part.match(matchRegex)) {
        return <code key={i}>{part.slice(1, -1)}</code>;
      } else {
        return part;
      }
    });

    return <>{codeParts}</>; // return the wrapped text
  }
}
