import React from 'react';
import { useLocalize } from '~/hooks';

export default function EmptyPromptPreview() {
  const localize = useLocalize();

  return (
    <div className="h-full w-full content-center text-center font-bold text-text-secondary">
      {localize('com_ui_select_or_create_prompt')}
    </div>
  );
}
