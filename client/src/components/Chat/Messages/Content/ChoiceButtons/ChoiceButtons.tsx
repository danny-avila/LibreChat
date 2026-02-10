import React, { useState, useCallback } from 'react';
import { Check } from 'lucide-react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useChatContext, useMessageContext } from '~/Providers';
import { useAuthContext } from '~/hooks/AuthContext';
import store from '~/store';

interface ChoiceButtonsProps {
  node?: unknown;
  choices?: string;
  children?: React.ReactNode;
}

export function ChoiceButtons({ choices: choicesJson }: ChoiceButtonsProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const { ask, getMessages, setMessages, latestMessage } = useChatContext();
  const { isSubmitting } = useMessageContext();
  const { isAuthenticated } = useAuthContext();
  const setAuthGateOpen = useSetRecoilState(store.authGateOpen);
  const activeFeature = useRecoilValue(store.activeFeature);

  const color = activeFeature || 'chat';

  let choiceLabels: string[] = [];
  try {
    choiceLabels = choicesJson ? JSON.parse(choicesJson) : [];
  } catch {
    return null;
  }

  if (choiceLabels.length === 0) {
    return null;
  }

  const handleChoice = useCallback(
    (choice: string) => {
      if (selected || isSubmitting) {
        return;
      }

      if (!isAuthenticated) {
        setAuthGateOpen(true);
        return;
      }

      setSelected(choice);

      // Sync latestMessage into root messages (same pattern as useSubmitMessage)
      const rootMessages = getMessages();
      if (
        latestMessage &&
        !rootMessages?.some((m) => m.messageId === latestMessage.messageId)
      ) {
        setMessages([...(rootMessages || []), latestMessage]);
      }

      ask({ text: choice });
    },
    [selected, isSubmitting, isAuthenticated, setAuthGateOpen, ask, getMessages, setMessages, latestMessage],
  );

  const isDisabled = !!selected || isSubmitting;

  return (
    <div className="my-3 flex flex-wrap gap-2">
      {choiceLabels.map((label) => {
        const isSelected = selected === label;
        const isDimmed = selected != null && !isSelected;

        return (
          <button
            key={label}
            type="button"
            disabled={isDisabled}
            onClick={() => handleChoice(label)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
              isSelected
                ? 'border-transparent text-white'
                : isDimmed
                  ? 'border-border-light text-text-tertiary opacity-50'
                  : 'border-border-light text-text-primary hover:border-transparent hover:text-white'
            } ${isDisabled && !isSelected ? 'cursor-default' : ''}`}
            style={
              isSelected
                ? {
                    backgroundColor: `var(--feature-${color})`,
                    color: `var(--feature-${color}-icon)`,
                  }
                : !isDimmed && !isDisabled
                  ? undefined
                  : undefined
            }
            onMouseEnter={(e) => {
              if (isDisabled) {
                return;
              }
              (e.currentTarget as HTMLElement).style.backgroundColor =
                `var(--feature-${color})`;
              (e.currentTarget as HTMLElement).style.color =
                `var(--feature-${color}-icon)`;
              (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
            }}
            onMouseLeave={(e) => {
              if (isDisabled) {
                return;
              }
              (e.currentTarget as HTMLElement).style.backgroundColor = '';
              (e.currentTarget as HTMLElement).style.color = '';
              (e.currentTarget as HTMLElement).style.borderColor = '';
            }}
          >
            {isSelected && <Check size={14} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
