import { useState, useRef, useEffect, useMemo, memo, useCallback } from 'react';
import { AutoSizer, List } from 'react-virtualized';
import { Spinner, useCombobox } from '@librechat/client';
import { useSetRecoilState, useRecoilValue } from 'recoil';

import type {
  TPromptGroup,
  MCPPromptResponseArray,
  MCPPromptResponse,
} from 'librechat-data-provider';
import type { PromptOption } from '~/common';
import { removeCharIfLast, detectVariables } from '~/utils';
import VariableDialog from '~/components/Prompts/Groups/VariableDialog';
import { usePromptGroupsContext } from '~/Providers';
import MentionItem from './MentionItem';
import { useLocalize } from '~/hooks';
import store from '~/store';
import CategoryIcon from '~/components/Prompts/Groups/CategoryIcon';
import { useGetAllMCPPrompts } from '~/data-provider';

const commandChar = '/';

const PopoverContainer = memo(
  ({
    index,
    children,
    isVariableDialogOpen,
    variableGroup,
    mcpPrompt,
    isMcpPrompt,
    setVariableDialogOpen,
  }: {
    index: number;
    children: React.ReactNode;
    isVariableDialogOpen: boolean;
    variableGroup: TPromptGroup | null;
    mcpPrompt: MCPPromptResponse | null;
    isMcpPrompt: boolean;
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
          mcpPrompt={mcpPrompt}
          mcp={isMcpPrompt}
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
  submitPrompt: (textPrompt: string) => void;
}) {
  const localize = useLocalize();
  const { allPromptGroups, hasAccess } = usePromptGroupsContext();
  const { data, isLoading } = allPromptGroups;
  // Get MCP prompts directly here
  const { data: mcpPromptsData, isLoading: mcpIsLoading } = useGetAllMCPPrompts({
    select: (data: MCPPromptResponseArray): MCPPromptResponse[] => {
      if (!data || typeof data !== 'object') {
        return [];
      }

      return Object.entries(data).map(([key, prompt]) => {
        const typedPrompt = prompt as MCPPromptResponse;
        const serverName = typedPrompt.mcpServerName || key.split('_mcp_')[1] || 'unknown';
        return {
          name: typedPrompt.name,
          description: typedPrompt.description ?? '',
          mcpServerName: serverName,
          promptKey: typedPrompt.name + '_mcp_' + serverName,
          category: 'mcpServer',
          authorName: 'MCP Server',
          arguments: typedPrompt.arguments,
        };
      });
    },
  });

  console.log('MCP Prompts Data:', mcpPromptsData);
  console.log('Regular prompts data:', data);
  console.log('Has access to prompts:', hasAccess);
  console.log('MCP loading:', mcpIsLoading);
  console.log('Regular loading:', isLoading);

  const [activeIndex, setActiveIndex] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isVariableDialogOpen, setVariableDialogOpen] = useState(false);
  const [variableGroup, setVariableGroup] = useState<TPromptGroup | null>(null);
  const [mcpPrompt, setMcpPrompt] = useState<MCPPromptResponse | null>(null);
  const [isMcpPrompt, setIsMcpPrompt] = useState(false);
  const setShowPromptsPopover = useSetRecoilState(store.showPromptsPopoverFamily(index));

  const prompts = useMemo(() => {
    // Only include regular prompts if user has access
    const regularPrompts = hasAccess ? data?.promptGroups || [] : [];

    // Convert MCP prompts to PromptOption format
    const mcpPromptOptions: PromptOption[] = (mcpPromptsData || []).map((mcpPrompt) => ({
      id: mcpPrompt.promptKey,
      type: 'prompt',
      value: mcpPrompt.name,
      label: `On MCP Server: ${mcpPrompt?.mcpServerName || mcpPrompt.promptKey.split('_mcp_')[1]}`,
      description: mcpPrompt.description,
      icon: <CategoryIcon category="mcpServer" className="h-5 w-5" />,
      mcpData: mcpPrompt,
    }));
    console.log('mcpPromptOptions:', mcpPromptOptions);
    return [...regularPrompts, ...mcpPromptOptions];
  }, [hasAccess, data?.promptGroups, mcpPromptsData]);

  console.log('Combined Prompts:', prompts);

  // Create promptsMap including MCP prompts
  const promptsMap = useMemo(() => {
    // Only include regular prompts map if user has access
    const regularMap = hasAccess ? data?.promptsMap || {} : {};

    // Add MCP prompts to the map
    const mcpMap: Record<string, any> = {};
    (mcpPromptsData || []).forEach((mcpPrompt) => {
      mcpMap[mcpPrompt.promptKey] = {
        _id: mcpPrompt.promptKey,
        name: mcpPrompt.name,
        productionPrompt: {
          prompt: mcpPrompt.description,
        },
        category: 'mcpServer',
        mcpData: mcpPrompt,
      };
    });

    return { ...regularMap, ...mcpMap };
  }, [hasAccess, data?.promptsMap, mcpPromptsData]);
  console.log('Combined Prompts Map:', promptsMap);
  // Use combined loading state
  const isAnyLoading = isLoading || mcpIsLoading;

  const { open, setOpen, searchValue, setSearchValue, matches } = useCombobox({
    value: '',
    options: prompts ?? [],
  });

  const handleSelect = useCallback(
    (mention?: PromptOption, e?: React.KeyboardEvent<HTMLInputElement>) => {
      if (!mention) {
        return;
      }

      setSearchValue('');
      setOpen(false);
      setShowPromptsPopover(false);

      if (textAreaRef.current) {
        removeCharIfLast(textAreaRef.current, commandChar);
      }

      const group = promptsMap?.[mention.id];
      if (!group) {
        return;
      }

      if (group.mcpData) {
        const mcpPromptData = group.mcpData;
        const hasVariables = detectVariables(mcpPromptData.description ?? '');
        
        if (hasVariables) {
          if (e && e.key === 'Tab') {
            e.preventDefault();
          }
          setMcpPrompt(mcpPromptData);
          setIsMcpPrompt(true);
          setVariableGroup(group); // Pass the group which contains the mcpData
          setVariableDialogOpen(true);
          return;
        } else {
          submitPrompt(mcpPromptData.description || mcpPromptData.name);
          return;
        }
      }

      const hasVariables = detectVariables(group.productionPrompt?.prompt ?? '');
      if (hasVariables) {
        if (e && e.key === 'Tab') {
          e.preventDefault();
        }
        setMcpPrompt(null);
        setIsMcpPrompt(false);
        setVariableGroup(group);
        setVariableDialogOpen(true);
        return;
      } else {
        submitPrompt(group.productionPrompt?.prompt ?? '');
      }
    },
    [setSearchValue, setOpen, setShowPromptsPopover, textAreaRef, promptsMap, submitPrompt],
  );

  useEffect(() => {
    if (!open) {
      setActiveIndex(0);
    } else {
      setVariableGroup(null);
      setMcpPrompt(null);
      setIsMcpPrompt(false);
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

  // Show component if user has access to regular prompts OR if there are MCP prompts available
  const hasMCPPrompts = mcpPromptsData && mcpPromptsData.length > 0;
  if (!hasAccess && !hasMCPPrompts) {
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
      mcpPrompt={mcpPrompt}
      isMcpPrompt={isMcpPrompt}
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
              if (isAnyLoading && open) {
                return (
                  <div className="flex h-32 items-center justify-center text-text-primary">
                    <Spinner />
                  </div>
                );
              }

              if (!isAnyLoading && open) {
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
