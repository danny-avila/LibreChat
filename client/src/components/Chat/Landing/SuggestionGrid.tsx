import React, { memo, useCallback } from 'react';
import { isAgentsEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import { mainTextareaId } from '~/common';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import { useChatContext, useChatFormContext } from '~/Providers';
import { SUGGESTIONS } from './suggestions';
import SuggestionCard from './SuggestionCard';

// V1 UX POP/BETC : 4 boutons de suggestions sous le composer pour
// orienter l'usage agence (brainstorm créatif, analyse insight,
// rédaction accroche, synthèse brief). Affichés en LLM direct
// uniquement, pane principal (index=0). À affiner avec retours users.
// Repasser à false pour cacher l'ensemble de la rangée.
const SHOW_LANDING_SUGGESTIONS = true;

interface SuggestionGridProps {
  index: number;
}

function SuggestionGrid({ index }: SuggestionGridProps) {
  const localize = useLocalize();
  const methods = useChatFormContext();
  const { conversation } = useChatContext();

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

  const endpoint = conversation?.endpoint;
  const isLlmDirect =
    !!endpoint && !isAgentsEndpoint(endpoint) && !isAssistantsEndpoint(endpoint);

  if (!SHOW_LANDING_SUGGESTIONS || !isLlmDirect || index !== 0) {
    return null;
  }

  return (
    <div className="mx-auto mt-3 flex w-full md:max-w-3xl xl:max-w-4xl flex-col items-start gap-2 sm:px-2">
      <p className="text-sm text-text-secondary">
        {localize('com_ui_landing_suggestions_intro')}
      </p>
      <div className="flex flex-wrap justify-start gap-2">
        {SUGGESTIONS.map((s) => (
          <SuggestionCard
            key={s.id}
            icon={s.icon}
            title={localize(s.titleKey)}
            onClick={() => handleSelect(s.promptKey)}
          />
        ))}
      </div>
    </div>
  );
}

export default memo(SuggestionGrid);
