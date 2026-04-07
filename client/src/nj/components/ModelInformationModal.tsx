/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import { AnthropicIcon, OGDialog, OGDialogContent } from '@librechat/client';
import React from 'react';

export default function ModelInformationModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="flex w-auto flex-col items-center gap-4 px-16 py-12">
        <AnthropicIcon size={64} />
        <p className="text-lg font-semibold">Claude Sonnet 4.5</p>
        <p>Knowledge cutoff: January 2025</p>
        <p>Released: September 2025</p>
      </OGDialogContent>
    </OGDialog>
  );
}
