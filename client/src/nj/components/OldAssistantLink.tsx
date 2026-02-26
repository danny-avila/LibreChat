/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import React from 'react';
import { useLocation } from 'react-router-dom';
import { useChatContext } from '~/Providers';

/**
 * Link to the old AI assistant.
 *
 * Temporarily being added during our transition to 2.0 - should be deleted eventually!
 */
export default function OldAssistantLink() {
  const location = useLocation();
  const { isSubmitting } = useChatContext();

  // Only show the old chat assistant link on the landing page
  if (location.pathname !== '/c/new' || isSubmitting) {
    return <></>;
  }

  return (
    <div className="md:pr-4">
      <a
        href="https://legacy.ai-assistant.nj.gov/"
        className="font-semibold text-jersey-blue underline hover:decoration-2"
        target="_blank"
        rel="noreferrer"
      >
        <span className="md:hidden">Use old Assistant</span>
        <span className="hidden md:inline">Use the old AI Assistant</span>
      </a>
    </div>
  );
}
