import { useCallback } from 'react';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import { GitCompareArrows } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { isAssistantsEndpoint } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import { useGetConversation, useLocalize } from '~/hooks';
import { mainTextareaId } from '~/common';
import store from '~/store';

function AddMultiConvo() {
  const localize = useLocalize();
  const getConversation = useGetConversation(0);
  const endpoint = useRecoilValue(store.conversationEndpointByIndex(0));
  const setAddedConvo = useSetRecoilState(store.conversationByIndex(1));

  const clickHandler = useCallback(() => {
    const conversation = getConversation();
    const { title: _t, ...convo } = conversation ?? ({} as TConversation);
    setAddedConvo({
      ...convo,
      title: '',
    } as TConversation);

    const textarea = document.getElementById(mainTextareaId);
    if (textarea) {
      textarea.focus();
    }
  }, [getConversation, setAddedConvo]);

  if (!endpoint) {
    return null;
  }

  if (isAssistantsEndpoint(endpoint)) {
    return null;
  }

  return (
    <TooltipAnchor
      description={localize('com_ui_compare_tooltip')}
      role="button"
      tabIndex={0}
      aria-label={localize('com_ui_compare')}
      onClick={clickHandler}
      data-testid="add-multi-convo-button"
      className="inline-flex h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border-light bg-presentation px-3 text-sm text-text-primary transition-all ease-in-out hover:bg-surface-tertiary disabled:pointer-events-none disabled:opacity-50 radix-state-open:bg-surface-tertiary"
    >
      <GitCompareArrows className="icon-sm" aria-hidden="true" />
      <span>{localize('com_ui_compare')}</span>
    </TooltipAnchor>
  );
}

export default AddMultiConvo;
