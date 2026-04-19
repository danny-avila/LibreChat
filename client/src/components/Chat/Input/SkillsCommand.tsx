import { memo, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ScrollText } from 'lucide-react';
import { AutoSizer, List } from 'react-virtualized';
import { Spinner, useCombobox } from '@librechat/client';
import { InvocationMode } from 'librechat-data-provider';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import type { TSkillSummary } from 'librechat-data-provider';
import type { MentionOption } from '~/common';
import useInitPopoverInput from '~/hooks/Input/useInitPopoverInput';
import { useLocalize, useSkillActiveState } from '~/hooks';
import { useAgentsMapContext } from '~/Providers';
import { useSkillsInfiniteQuery } from '~/data-provider';
import { isEphemeralAgent } from '~/common';
import { ephemeralAgentByConvoId } from '~/store';
import { removeCharIfLast } from '~/utils';
import MentionItem from './MentionItem';
import store from '~/store';

const commandChar = '$';
const ROW_HEIGHT = 44;
const skillIcon = <ScrollText className="icon-md text-cyan-500" />;

/**
 * Determines whether a skill should appear in the `$` command popover.
 * `manual` and `both` are user-invocable. `auto` is model-only and hidden.
 * Skills without an explicit mode (undefined) default to visible for
 * backward compatibility until the backend persists `invocationMode`.
 */
export function isUserInvocable(skill: TSkillSummary): boolean {
  const mode = skill.invocationMode;
  if (mode == null || mode === InvocationMode.both) {
    return true;
  }
  return mode === InvocationMode.manual;
}

/**
 * Filters the skills list down to what should appear in the `$` popover.
 * Composes three rules, short-circuiting on the cheapest check first:
 *
 * 1. Agent scope — mirrors backend `scopeSkillIds` semantics:
 *    - `null` / `undefined` → no scope filter (ephemeral convo, or agent
 *      without a `skills` field configured).
 *    - `[]` → explicit opt-out, nothing passes.
 *    - non-empty → intersection with the agent's configured skill ids.
 * 2. Active state — per-user ownership-aware toggle.
 * 3. Invocation mode — `manual` / `both` / undefined are visible; `auto`
 *    is model-only and hidden.
 *
 * Pure function; exported so tests can exercise the filter in isolation
 * without rendering the component.
 */
export function filterSkillsForPopover(
  skills: TSkillSummary[],
  ctx: {
    agentSkillIds: string[] | null | undefined;
    isActive: (skill: Pick<TSkillSummary, '_id' | 'author'>) => boolean;
  },
): TSkillSummary[] {
  const { agentSkillIds, isActive } = ctx;
  if (agentSkillIds != null && agentSkillIds.length === 0) {
    return [];
  }
  const agentSet =
    agentSkillIds != null && agentSkillIds.length > 0 ? new Set(agentSkillIds) : null;
  const result: TSkillSummary[] = [];
  for (const skill of skills) {
    if (agentSet && !agentSet.has(skill._id)) {
      continue;
    }
    if (!isActive(skill)) {
      continue;
    }
    if (!isUserInvocable(skill)) {
      continue;
    }
    result.push(skill);
  }
  return result;
}

function SkillsCommandContent({
  index,
  textAreaRef,
  conversationId,
  agentId,
}: {
  index: number;
  textAreaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  conversationId: string;
  agentId?: string | null;
}) {
  const localize = useLocalize();
  const setShowSkillsPopover = useSetRecoilState(store.showSkillsPopoverFamily(index));
  const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(conversationId));
  const setPendingManualSkills = useSetRecoilState(
    store.pendingManualSkillsByConvoId(conversationId),
  );

  const agentsMap = useAgentsMapContext();
  const { isActive } = useSkillActiveState();

  /* Resolve the per-agent skill scope. Mirrors backend `scopeSkillIds` for
     the happy path: no `skills` field → no scope, `[]` → opt-out, non-empty
     → intersection. Ephemeral agent ids (null/undefined/placeholder strings
     that don't begin with `agent_`) are unscoped — they correspond to
     conversations without a persisted agent and are intentionally absent
     from the agents map. While the map is still hydrating we pass through
     (undefined → full catalog): the backend enforces scope at turn time, so
     there's no security benefit to flashing an empty popover, and the map
     typically lands well before the first open. Once the map is authoritative
     but the agent isn't in it (deleted, or VIEW revoked mid-session), we fail
     closed — scope is unresolvable and the full catalog would be misleading.
     `agentId` is threaded in as a prop so this component stays memoizable
     and skips re-renders on unrelated conversation-shape changes. */
  const agentSkillIds = useMemo<string[] | null | undefined>(() => {
    if (!agentId || isEphemeralAgent(agentId)) {
      return undefined;
    }
    if (!agentsMap) {
      return undefined;
    }
    const agent = agentsMap[agentId];
    if (!agent) {
      return [];
    }
    return agent.skills;
  }, [agentId, agentsMap]);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSkillsInfiniteQuery({ limit: 50 });

  /* Sticky circuit breaker: once any page request fails, stop auto-fetching
     for the lifetime of the popover so a transient API error does not turn
     into an unbounded retry loop (isError can flip back to false on the
     next attempt, which would otherwise re-arm the auto-fetch effect). */
  const paginationBlockedRef = useRef(false);
  useEffect(() => {
    if (isError) {
      paginationBlockedRef.current = true;
    }
  }, [isError]);

  /* Auto-fetch all pages so client-side search covers the full catalog,
     not just the first page. The skills API is server-side capped. */
  useEffect(() => {
    if (paginationBlockedRef.current || isError) {
      return;
    }
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  const skillOptions: MentionOption[] = useMemo(() => {
    if (!data?.pages) {
      return [];
    }
    const allSkills: TSkillSummary[] = [];
    for (const page of data.pages) {
      for (const skill of page.skills) {
        allSkills.push(skill);
      }
    }
    const filtered = filterSkillsForPopover(allSkills, { agentSkillIds, isActive });
    const options: MentionOption[] = [];
    for (const skill of filtered) {
      options.push({
        label: skill.displayTitle ?? skill.name,
        value: skill.name,
        description: skill.description,
        type: 'skill',
        icon: skillIcon,
      });
    }
    return options;
  }, [data?.pages, agentSkillIds, isActive]);

  const [activeIndex, setActiveIndex] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { open, setOpen, searchValue, setSearchValue, matches } = useCombobox({
    value: '',
    options: skillOptions,
  });

  const initInputRef = useInitPopoverInput({
    inputRef,
    textAreaRef,
    commandChar,
    setSearchValue,
    setOpen,
  });

  const handleSelect = useCallback(
    (mention?: MentionOption) => {
      if (!mention) {
        return;
      }

      setSearchValue('');
      setOpen(false);
      setShowSkillsPopover(false);

      if (textAreaRef.current) {
        removeCharIfLast(textAreaRef.current, commandChar);
      }

      setEphemeralAgent((prev) => {
        if (prev?.skills) {
          return prev;
        }
        return { ...(prev || {}), skills: true };
      });

      /* Structured channel for manual skill invocations. The submit
         pipeline reads this and primes SKILL.md as a meta user message
         before the LLM turn — no textarea-level marker is needed, and
         injecting `$skill-name ` as text would mislead users into thinking
         free-form text invocation is supported. Visual confirmation after
         submit comes from `ManualSkillPills` on the user message bubble
         until the live skill-card stream takes over. */
      setPendingManualSkills((prev) =>
        prev.includes(mention.value) ? prev : [...prev, mention.value],
      );

      textAreaRef.current?.focus();
    },
    [
      setSearchValue,
      setOpen,
      setShowSkillsPopover,
      textAreaRef,
      setEphemeralAgent,
      setPendingManualSkills,
    ],
  );

  useEffect(() => {
    if (!open) {
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(matches.length - 1, 0)));
  }, [matches.length]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const el = document.getElementById(`skill-item-${activeIndex}`);
    el?.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  }, [activeIndex]);

  const rowRenderer = ({
    index,
    key,
    style,
  }: {
    index: number;
    key: string;
    style: React.CSSProperties;
  }) => {
    const mention = matches[index] as MentionOption;
    return (
      <MentionItem
        index={index}
        type="skill"
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
    <div className="absolute bottom-28 z-10 w-full space-y-2">
      <div className="popover border-token-border-light rounded-2xl border bg-surface-tertiary-alt p-2 shadow-lg">
        <input
          ref={initInputRef}
          placeholder={localize('com_ui_skills_command_placeholder')}
          className="mb-1 w-full border-0 bg-surface-tertiary-alt p-2 text-sm focus:outline-none dark:text-gray-200"
          autoComplete="off"
          value={searchValue}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              setShowSkillsPopover(false);
              textAreaRef.current?.focus();
              return;
            }
            if (e.key === 'ArrowDown') {
              if (matches.length === 0) {
                return;
              }
              setActiveIndex((prevIndex) => (prevIndex + 1) % matches.length);
            } else if (e.key === 'ArrowUp') {
              if (matches.length === 0) {
                return;
              }
              setActiveIndex((prevIndex) => (prevIndex - 1 + matches.length) % matches.length);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
              if (matches.length === 0) {
                if (e.key === 'Enter') {
                  e.preventDefault();
                }
                setOpen(false);
                setShowSkillsPopover(false);
                textAreaRef.current?.focus();
                return;
              }
              e.preventDefault();
              handleSelect(matches[activeIndex] as MentionOption | undefined);
            } else if (e.key === 'Backspace' && searchValue === '') {
              setOpen(false);
              setShowSkillsPopover(false);
              textAreaRef.current?.focus();
            }
          }}
          onChange={(e) => setSearchValue(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            timeoutRef.current = setTimeout(() => {
              setOpen(false);
              setShowSkillsPopover(false);
            }, 150);
          }}
        />
        {open && (isLoading || isFetchingNextPage) && matches.length === 0 && (
          <div className="flex h-32 items-center justify-center text-text-primary">
            <Spinner />
          </div>
        )}
        {open && isError && (
          <div className="p-4 text-center text-sm text-text-secondary">
            {localize('com_ui_skills_load_error')}
          </div>
        )}
        {open && !isLoading && !isFetchingNextPage && !isError && matches.length === 0 && (
          <div className="p-4 text-center text-sm text-text-secondary">
            {localize(searchValue ? 'com_ui_no_skills_found' : 'com_ui_skills_empty')}
          </div>
        )}
        {open && matches.length > 0 && (
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
        )}
      </div>
    </div>
  );
}

const SkillsCommand = memo(function SkillsCommand({
  index,
  textAreaRef,
  conversationId,
  agentId,
}: {
  index: number;
  textAreaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  conversationId: string;
  agentId?: string | null;
}) {
  const show = useRecoilValue(store.showSkillsPopoverFamily(index));
  if (!show) {
    return null;
  }
  return (
    <SkillsCommandContent
      index={index}
      textAreaRef={textAreaRef}
      conversationId={conversationId}
      agentId={agentId}
    />
  );
});

export default SkillsCommand;
