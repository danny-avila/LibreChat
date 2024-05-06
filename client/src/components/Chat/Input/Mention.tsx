import { useState, useRef, useEffect } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { SetterOrUpdater } from 'recoil';
import type { MentionOption } from '~/common';
import { useAssistantsMapContext } from '~/Providers';
import useMentions from '~/hooks/Input/useMentions';
import { useLocalize, useCombobox } from '~/hooks';
import MentionItem from './MentionItem';

export default function Mention({
  setShowMentionPopover,
  textAreaRef,
}: {
  setShowMentionPopover: SetterOrUpdater<boolean>;
  textAreaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
}) {
  const localize = useLocalize();
  const assistantMap = useAssistantsMapContext();
  const { options, modelsConfig, onSelectMention } = useMentions({ assistantMap });

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [inputOptions, setInputOptions] = useState<MentionOption[]>(options);

  const { open, setOpen, searchValue, setSearchValue, matches } = useCombobox({
    value: '', // not necessary here
    options: inputOptions,
  });

  const handleSelect = (mention?: MentionOption) => {
    if (!mention) {
      return;
    }

    const defaultSelect = () => {
      setSearchValue('');
      setOpen(false);
      setShowMentionPopover(false);
      onSelectMention(mention);
    };

    if (mention.type === 'endpoint' && mention.value === EModelEndpoint.assistants) {
      defaultSelect();
    }
    if (mention.type === 'endpoint') {
      const models = (modelsConfig?.[mention.value ?? ''] ?? []).map((model) => ({
        value: mention.value,
        label: model,
        type: 'model',
      }));

      setSearchValue('');
      setInputOptions(models);
      inputRef.current?.focus();
    } else if (mention.type === 'model') {
      defaultSelect();
    } else {
      defaultSelect();
    }
  };

  useEffect(() => {
    if (!open) {
      setInputOptions(options);
    }
  }, [open, options]);

  return (
    <div className="absolute bottom-16 z-10 w-full space-y-2">
      <div className="popover border-token-border-light rounded-2xl border bg-white p-2 shadow-lg dark:bg-gray-700">
        <input
          autoFocus
          ref={inputRef}
          placeholder={localize('com_ui_mention')}
          className="mb-1 w-full border-0 bg-white p-2 text-sm focus:outline-none dark:bg-gray-700 dark:text-gray-200"
          autoComplete="off"
          value={searchValue}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Tab') {
              const mentionOption = matches[0] as MentionOption | undefined;
              if (mentionOption?.type === 'endpoint') {
                e.preventDefault();
              }
              handleSelect(mentionOption);
            }
            if (e.key === 'Backspace' && searchValue === '') {
              setOpen(false);
              setShowMentionPopover(false);
              textAreaRef.current?.focus();
            }
          }}
          onChange={(e) => setSearchValue(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            timeoutRef.current = setTimeout(() => {
              setOpen(false);
              setShowMentionPopover(false);
            }, 150);
          }}
        />
        {open && (
          <div className="max-h-40 overflow-y-auto">
            {matches.map((mention, index) => (
              <MentionItem
                index={index}
                key={`${mention.value}-${index}`}
                onClick={() => {
                  if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                  }
                  timeoutRef.current = null;
                  handleSelect(mention as MentionOption);
                }}
                name={mention.label ?? ''}
                icon={mention.icon}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
