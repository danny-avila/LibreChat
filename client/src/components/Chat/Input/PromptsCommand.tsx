import { useState, useRef, useEffect, useMemo, memo, useCallback } from 'react';
import { AutoSizer, List } from 'react-virtualized';
import { Spinner, useCombobox } from '@librechat/client';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { TPromptGroup, AgentToolResources } from 'librechat-data-provider';
import type { PromptOption } from '~/common';
import { removeCharIfLast, detectVariables } from '~/utils';
import VariableDialog from '~/components/Prompts/Groups/VariableDialog';
import { usePromptGroupsContext } from '~/Providers';
import { useLocalize, useHasAccess } from '~/hooks';
import MentionItem from './MentionItem';
import store from '~/store';

const commandChar = '/';

const PopoverContainer = memo(
  ({
    index,
    children,
    isVariableDialogOpen,
    variableGroup,
    setVariableDialogOpen,
  }: {
    index: number;
    children: React.ReactNode;
    isVariableDialogOpen: boolean;
    variableGroup: TPromptGroup | null;
    setVariableDialogOpen: (isOpen: boolean) => void;
  }) => {
    const showPromptsPopover = useRecoilValue(store.showPromptsPopoverFamily(index));
    return (
      <>
        {showPromptsPopover ? children : null}
        <VariableDialog
          open={isVariableDialogOpen}
          onClose={() => setVariableDialogOpen(false)}
          group={variableGroup}
        />
      </>
    );
  },
);

const ROW_HEIGHT = 40;

function PromptsCommand({
  index,
  textAreaRef,
  submitPrompt,
}: {
  index: number;
  textAreaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  submitPrompt: (textPrompt: string, toolResources?: AgentToolResources) => void;
}) {
  const localize = useLocalize();
  const hasAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
  });

  const { allPromptGroups } = usePromptGroupsContext();
  const { data, isLoading } = allPromptGroups;

  const [activeIndex, setActiveIndex] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isVariableDialogOpen, setVariableDialogOpen] = useState(false);
  const [variableGroup, setVariableGroup] = useState<TPromptGroup | null>(null);
  const setShowPromptsPopover = useSetRecoilState(store.showPromptsPopoverFamily(index));

  const prompts = useMemo(() => data?.promptGroups, [data]);
  const promptsMap = useMemo(() => data?.promptsMap, [data]);

  const { open, setOpen, searchValue, setSearchValue, matches } = useCombobox({
    value: '',
    options: prompts ?? [],
  });

  const handleSelect = useCallback(
    (mention?: PromptOption, e?: React.KeyboardEvent<HTMLInputElement>) => {
      console.log('PromptsCommand.handleSelect called with mention:', mention);

      if (!mention) {
        console.log('No mention provided');
        return;
      }

      setSearchValue('');
      setOpen(false);
      setShowPromptsPopover(false);

      if (textAreaRef.current) {
        removeCharIfLast(textAreaRef.current, commandChar);
      }

      const group = promptsMap?.[mention.id];
      console.log('Found group for mention:', group);
      if (!group) {
        console.log('No group found for mention ID:', mention.id);
        return;
      }

      console.log('Group productionPrompt details:', {
        hasProductionPrompt: !!group.productionPrompt,
        prompt: group.productionPrompt?.prompt?.substring(0, 100) + '...',
        tool_resources: group.productionPrompt?.tool_resources,
        hasToolResources: !!group.productionPrompt?.tool_resources,
      });

      const hasVariables = detectVariables(group.productionPrompt?.prompt ?? '');
      if (hasVariables) {
        if (e && e.key === 'Tab') {
          e.preventDefault();
        }
        setVariableGroup(group);
        setVariableDialogOpen(true);
        return;
      } else {
        console.log('PromptsCommand - Clicking prompt:', {
          promptName: group.name,
          promptText: group.productionPrompt?.prompt,
          toolResources: group.productionPrompt?.tool_resources,
          hasToolResources: !!group.productionPrompt?.tool_resources,
          toolResourcesKeys: group.productionPrompt?.tool_resources
            ? Object.keys(group.productionPrompt.tool_resources)
            : [],
        });
        submitPrompt(group.productionPrompt?.prompt ?? '', group.productionPrompt?.tool_resources);
      }
    },
    [setSearchValue, setOpen, setShowPromptsPopover, textAreaRef, promptsMap, submitPrompt],
  );

  useEffect(() => {
    if (!open) {
      setActiveIndex(0);
    } else {
      setVariableGroup(null);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const currentActiveItem = document.getElementById(`prompt-item-${activeIndex}`);
    currentActiveItem?.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  }, [activeIndex]);

  if (!hasAccess) {
    return null;
  }

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
        onClick={() => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = null;
          handleSelect(mention);
        }}
        name={mention.label ?? ''}
        icon={mention.icon}
        description={mention.description}
        isActive={index === activeIndex}
      />
    );
  };

  return (
    <PopoverContainer
      index={index}
      isVariableDialogOpen={isVariableDialogOpen}
      variableGroup={variableGroup}
      setVariableDialogOpen={setVariableDialogOpen}
    >
      <div className="absolute bottom-28 z-10 w-full space-y-2">
        <div className="popover border-token-border-light rounded-2xl border bg-surface-tertiary-alt p-2 shadow-lg">
          <input
            // The user expects focus to transition to the input field when the popover is opened
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            ref={inputRef}
            placeholder={localize('com_ui_command_usage_placeholder')}
            className="mb-1 w-full border-0 bg-surface-tertiary-alt p-2 text-sm focus:outline-none dark:text-gray-200"
            autoComplete="off"
            value={searchValue}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false);
                setShowPromptsPopover(false);
                textAreaRef.current?.focus();
              }
              if (e.key === 'ArrowDown') {
                setActiveIndex((prevIndex) => (prevIndex + 1) % matches.length);
              } else if (e.key === 'ArrowUp') {
                setActiveIndex((prevIndex) => (prevIndex - 1 + matches.length) % matches.length);
              } else if (e.key === 'Enter' || e.key === 'Tab') {
                if (e.key === 'Enter') {
                  e.preventDefault();
                }
                handleSelect(matches[activeIndex] as PromptOption | undefined, e);
              } else if (e.key === 'Backspace' && searchValue === '') {
                setOpen(false);
                setShowPromptsPopover(false);
                textAreaRef.current?.focus();
              }
            }}
            onChange={(e) => setSearchValue(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              timeoutRef.current = setTimeout(() => {
                setOpen(false);
                setShowPromptsPopover(false);
              }, 150);
            }}
          />
          <div className="max-h-40 overflow-y-auto">
            {(() => {
              if (isLoading && open) {
                return (
                  <div className="flex h-32 items-center justify-center text-text-primary">
                    <Spinner />
                  </div>
                );
              }

              if (!isLoading && open) {
                return (
                  <div className="max-h-40">
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
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>
      </div>
    </PopoverContainer>
  );
}

export default memo(PromptsCommand);
