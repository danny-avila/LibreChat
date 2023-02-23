import React from 'react';

export default function CodeWrapper({ text }) {
  const matchRegex = /(`[^`]+?`)/g;
  const parts = text.split(matchRegex);
  // console.log('parts', parts);

  // map over the parts and wrap any text between tildes with <code> tags
  const codeParts = parts.map((part, index) => {
    if (part.match(matchRegex)) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    } else {
      return part;
    }
  });

  return <>{codeParts}</>; // return the wrapped text
}