import React from 'react';

/**
 * Renders links for ReactMarkdown w/ `target`/`rel` attributes (so links open on a new tab).
 */
export default function LinkRenderer(props: any) {
  return (
    <a href={props.href} target="_blank" rel="noreferrer">
      {props.children}
    </a>
  );
}
