import icons from '@uswds/uswds/img/sprite.svg';
import React from 'react';

interface InfoLinkProps {
  text: string;
  link: string;
  icon: string;
}

export default function InfoLink({ text, link, icon }: InfoLinkProps) {
  return (
    <div>
      <a
        href={link}
        className="inline-flex gap-1 underline hover:decoration-2"
        target="_blank"
        rel="noreferrer"
      >
        {text}
        <div className="inline-flex rounded bg-surface-secondary p-1">
          <svg
            className="usa-icon usa-icon--size-2"
            aria-hidden="true"
            focusable="false"
            role="img"
          >
            <use href={`${icons}#${icon}`} />
          </svg>
        </div>
      </a>
    </div>
  );
}
