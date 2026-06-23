import React from 'react';
import { Link } from 'react-router-dom';
import { createLinkTo } from '~/nj/utils/createLinkTo';

/**
 * Renders links for ReactMarkdown w/ `target`/`rel` attributes (so links open on a new tab).
 */
export default function LinkRenderer(props: any) {
  const link = createLinkTo(props.href);
  const isExternal = typeof link === 'string';
  return (
    <Link
      to={link}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noreferrer' : undefined}
    >
      {props.children}
    </Link>
  );
}
