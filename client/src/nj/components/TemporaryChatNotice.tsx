/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import icons from '@uswds/uswds/img/sprite.svg';
import React from 'react';

/**
 * Displays a warning (in the sidebar) that all chats are temporary.
 */
export default function TemporaryChatNotice() {
  return (
    <div className="mx-1 my-5 max-w-xs rounded-lg border border-[#E4E2DF] bg-presentation p-2">
      <div className="mb-1 flex items-center justify-between">
        <div className="m-0 text-sm font-medium text-text-primary">Temporary chats enabled</div>
        <svg className="usa-icon usa-icon--size-2" aria-hidden="true" focusable="false" role="img">
          <use href={`${icons}#info_outline`} />
        </svg>
      </div>
      <p className="m-0 text-sm leading-relaxed text-text-primary">
        For security reasons, chat history clears daily at midnight.
      </p>
    </div>
  );
}
