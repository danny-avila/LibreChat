import React, { memo, useCallback } from 'react';
import { mainTextareaId } from '~/common';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import { useChatFormContext } from '~/Providers';
import { SUGGESTIONS } from './suggestions';
import SuggestionCard from './SuggestionCard';

function SuggestionGrid() {
  const localize = useLocalize();
  const methods = useChatFormContext();

  const handleSelect = useCallback(
    (promptKey: TranslationKeys) => {
      const prompt = localize(promptKey);
      methods.setValue('text', prompt, { shouldValidate: true });
      requestAnimationFrame(() => {
        const el = document.getElementById(mainTextareaId) as HTMLTextAreaElement | null;
        if (el) {
          el.focus();
          el.setSelectionRange(prompt.length, prompt.length);
        }
      });
    },
    [localize, methods],
  );

  return (
    <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-3 px-4 sm:grid-cols-2">
      {SUGGESTIONS.map((s) => (
        <SuggestionCard
          key={s.id}
          icon={s.icon}
          title={localize(s.titleKey)}
          onClick={() => handleSelect(s.promptKey)}
        />
      ))}
    </div>
  );
}

export default memo(SuggestionGrid);
