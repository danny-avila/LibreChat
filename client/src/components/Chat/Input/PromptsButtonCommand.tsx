import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { AutoSizer, List } from 'react-virtualized';
import { Spinner, useCombobox } from '@librechat/client';
import { usePromptGroupsContext } from '~/Providers';
import { detectVariables } from '~/utils';
import VariableDialog from '~/components/Prompts/Groups/VariableDialog';
import MentionItem from '~/components/Chat/Input/MentionItem';
import { useLocalize } from '~/hooks';
import type { TPromptGroup } from 'librechat-data-provider';
import type { PromptOption } from '~/common';
import { TooltipAnchor } from '@librechat/client';

const ROW_HEIGHT = 40;

type PromptsDialogTriggerProps = {
  icon: React.ReactNode;
  submitPrompt: (textPrompt: string) => void;
};

const PromptsButtonCommand: React.FC<PromptsDialogTriggerProps> = ({ icon, submitPrompt }) => {
  const localize = useLocalize();
  const { allPromptGroups, hasAccess } = usePromptGroupsContext();
  const { data, isLoading } = allPromptGroups;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isVariableDialogOpen, setVariableDialogOpen] = useState(false);
  const [variableGroup, setVariableGroup] = useState<TPromptGroup | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const prompts = useMemo(() => data?.promptGroups, [data]);
  const promptsMap = useMemo(() => data?.promptsMap, [data]);

  // Use useCombobox for search/filtering, just like PromptsCommand
  const { matches, searchValue, setSearchValue } = useCombobox({
    value: '',
    options: prompts ?? [],
  });

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
    }
  }, [open, matches.length]);

  const handleSelect = useCallback(
    (mention?: PromptOption, e?: React.KeyboardEvent<HTMLInputElement>) => {
      if (!mention) return;
      setSearchValue('');
      setOpen(false);

      const group = promptsMap?.[mention.id];
      if (!group) return;

      const hasVariables = detectVariables(group.productionPrompt?.prompt ?? '');
      if (hasVariables) {
        if (e && e.key === 'Tab') e.preventDefault();
        setVariableGroup(group);
        setVariableDialogOpen(true);
        return;
      } else {
        submitPrompt(group.productionPrompt?.prompt ?? '');
      }
    },
    [promptsMap, setSearchValue, submitPrompt],
  );

  const rowRenderer = ({
    index,
    key,
    style,
  }: {
    index: number;
    key: string;
    style: React.CSSProperties;
  }) => {
    const mention = matches[index] as PromptOption;
    return (
      <MentionItem
        index={index}
        type="prompt"
        key={key}
        style={style}
        onClick={() => handleSelect(mention)}
        name={mention.label ?? ''}
        icon={mention.icon}
        description={mention.description}
        isActive={index === activeIndex}
      />
    );
  };

  if (!hasAccess) return null;

  return (
    <>
      <TooltipAnchor
        render={
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={localize('com_agents_prompt_selection')}
          >
            {icon}
          </button>
        }
        description={localize('com_agents_prompt_selection')}
        id="prompts-dialog-trigger"
      />
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-3xl rounded-2xl bg-surface-tertiary-alt p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            aria-label={localize('com_agents_prompt_selection')}
          >
            <input
              ref={inputRef}
              // The user expects focus to transition to the input field when the popover is opened
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              placeholder={localize('com_ui_command_usage_placeholder')}
              className="mb-1 w-full border-0 bg-surface-tertiary-alt p-2 text-sm focus:outline-none dark:text-gray-200"
              autoComplete="off"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setOpen(false);
                  return;
                }
                // Avoid navigation and selection when there are no matches
                if (!matches.length) {
                  return;
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveIndex((i) => (i + 1) % matches.length);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
                } else if (e.key === 'Enter' || e.key === 'Tab') {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }
              }}
            />
            <div className="max-h-40 overflow-y-auto">
              {isLoading ? (
                <div className="flex h-32 items-center justify-center text-text-primary">
                  <Spinner />
                </div>
              ) : (
                <AutoSizer disableHeight>
                  {({ width }) => (
                    <List
                      width={width}
                      overscanRowCount={5}
                      rowHeight={ROW_HEIGHT}
                      rowCount={matches.length}
                      rowRenderer={rowRenderer}
                      scrollToIndex={activeIndex}
                      height={Math.min(matches.length * ROW_HEIGHT, 160)}
                    />
                  )}
                </AutoSizer>
              )}
            </div>
          </div>
        </div>
      )}
      <VariableDialog
        open={isVariableDialogOpen}
        onClose={() => setVariableDialogOpen(false)}
        group={variableGroup}
      />
    </>
  );
};

export default PromptsButtonCommand;
