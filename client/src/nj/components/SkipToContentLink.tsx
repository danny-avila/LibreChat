/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import React from 'react';

/**
 * Used to create a "skip to main content" link on the page.
 *
 * @param targetRef reference to the targeted element we want to focus on click
 */
export default function SkipToContentLink({
  targetRef,
}: {
  targetRef: React.RefObject<HTMLElement>;
}) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (targetRef.current) {
      e.preventDefault();
      targetRef.current.focus();
    }
  };

  return (
    <button
      onClick={handleClick}
      className="absolute left-0 top-0 z-50 -translate-y-full transform bg-blue-500 px-4 py-2 text-white transition focus:translate-y-0"
    >
      Skip to content
    </button>
  );
}
