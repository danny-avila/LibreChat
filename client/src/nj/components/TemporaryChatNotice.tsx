/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import { Info } from 'lucide-react';

/**
 * Displays a warning (in the sidebar) that all chats are temporary.
 */
export default function TemporaryChatNotice() {
  return (
    <div className="mx-1 my-5 max-w-xs rounded-lg border border-[#E4E2DF] bg-presentation p-2">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="m-0 text-sm font-medium text-text-primary">Temporary chats enabled</h3>
        <Info className="h-4 w-4 text-text-primary" />
      </div>
      <p className="m-0 text-sm leading-relaxed text-text-primary">
        For security reasons, chat history clears daily at midnight.
      </p>
    </div>
  );
}
