import { memo, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ScrollText } from 'lucide-react';
import { AutoSizer, List } from 'react-virtualized';
import { Spinner, useCombobox } from '@librechat/client';
import { InvocationMode } from 'librechat-data-provider';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import type { TSkillSummary } from 'librechat-data-provider';
import type { MentionOption } from '~/common';
import useInitPopoverInput from '~/hooks/Input/useInitPopoverInput';
import { useSkillsInfiniteQuery } from '~/data-provider';
import { ephemeralAgentByConvoId } from '~/store';
import { removeCharIfLast } from '~/utils';
import MentionItem from './MentionItem';
import { useLocalize } from '~/hooks';
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

function SkillsCommandContent({
  index,
  textAreaRef,
  conversationId,
}: {
  index: number;
  textAreaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  conversationId: string;
}) {
  const localize = useLocalize();
  const setShowSkillsPopover = useSetRecoilState(store.showSkillsPopoverFamily(index));
  const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(conversationId));

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSkillsInfiniteQuery({ limit: 50 });

  /* Auto-fetch all pages so client-side search covers the full catalog,
     not just the first page. The skills API is server-side capped. */
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const skillOptions: MentionOption[] = useMemo(() => {
    if (!data?.pages) {
      return [];
    }
    return data.pages.reduce<MentionOption[]>((acc, page) => {
      for (const skill of page.skills) {
        if (isUserInvocable(skill)) {
          acc.push({
            label: skill.displayTitle ?? skill.name,
            value: skill.name,
            description: skill.description,
            type: 'skill',
            icon: skillIcon,
          });
        }
      }
      return acc;
    }, []);
  }, [data?.pages]);

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

      const textarea = textAreaRef.current;
      if (textarea) {
        const insertion = `$${mention.value} `;
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value',
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(textarea, insertion);
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
        textarea.focus();
        textarea.setSelectionRange(insertion.length, insertion.length);
      }
    },
    [setSearchValue, setOpen, setShowSkillsPopover, textAreaRef, setEphemeralAgent],
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
}: {
  index: number;
  textAreaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  conversationId: string;
}) {
  const show = useRecoilValue(store.showSkillsPopoverFamily(index));
  if (!show) {
    return null;
  }
  return (
    <SkillsCommandContent index={index} textAreaRef={textAreaRef} conversationId={conversationId} />
  );
});

export default SkillsCommand;
