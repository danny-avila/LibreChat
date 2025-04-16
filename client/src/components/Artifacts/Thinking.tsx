import { Atom, ChevronDown } from 'lucide-react';
import type { FC, MouseEvent } from 'react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { useLocalize } from '~/hooks';
import store from '~/store';
import { cn } from '~/utils';

const BUTTON_STYLES = {
  base: 'group mt-3 flex w-fit items-center justify-center rounded-xl bg-surface-tertiary px-3 py-2 text-xs leading-[18px] animate-thinking-appear',
  icon: 'icon-sm ml-1.5 transform-gpu text-text-primary transition-transform duration-200',
} as const;

const CONTENT_STYLES = {
  wrapper: 'relative pl-3 text-text-secondary',
  border:
    'absolute left-0 h-[calc(100%-10px)] border-l-2 border-border-medium dark:border-border-heavy',
  partBorder:
    'absolute left-0 h-[calc(100%)] border-l-2 border-border-medium dark:border-border-heavy',
  text: 'whitespace-pre-wrap leading-[26px] [&>span]:inline-block',
  word: 'animate-word-fade-in opacity-0',
} as const;

export const ThinkingContent: FC<{ children: React.ReactNode; isPart?: boolean }> = memo(
  ({ isPart, children }) => (
    <div className={CONTENT_STYLES.wrapper}>
      <div className={isPart === true ? CONTENT_STYLES.partBorder : CONTENT_STYLES.border} />
      <p className={CONTENT_STYLES.text}>
        {typeof children === 'string'
          ? children.split(/(\s+)/).map((word, index) => (
              <span
                key={`${word}-${index}`}
                className={word.trim() ? CONTENT_STYLES.word : undefined}
              >
                {word}
              </span>
            ))
          : children}
      </p>
    </div>
  ),
);

export const ThinkingButton = memo(
  ({
    isExpanded,
    onClick,
    label,
  }: {
    isExpanded: boolean;
    onClick: (e: MouseEvent<HTMLButtonElement>) => void;
    label: string;
  }) => (
    <button type="button" onClick={onClick} className={BUTTON_STYLES.base}>
      <Atom size={14} className="mr-1.5 text-text-secondary" />
      {label}
      <ChevronDown className={`${BUTTON_STYLES.icon} ${isExpanded ? 'rotate-180' : ''}`} />
    </button>
  ),
);

const Thinking: React.ElementType = memo(({ children }: { children: React.ReactNode }) => {
  const localize = useLocalize();
  const showThinking = useRecoilValue<boolean>(store.showThinking);
  const [isExpanded, setIsExpanded] = useState(showThinking);

  const handleClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsExpanded((prev) => !prev);
  }, []);

  const label = useMemo(() => localize('com_ui_thoughts'), [localize]);

  if (children == null) {
    return null;
  }

  return (
    <>
      <div className="mb-5">
        <ThinkingButton isExpanded={isExpanded} onClick={handleClick} label={label} />
      </div>
      <div
        className={cn('grid transition-all duration-300 ease-out', isExpanded && 'mb-8')}
        style={{
          gridTemplateRows: isExpanded ? '1fr' : '0fr',
        }}
      >
        <div className="overflow-hidden">
          <ThinkingContent isPart={true}>{children}</ThinkingContent>
        </div>
      </div>
    </>
  );
});

ThinkingButton.displayName = 'ThinkingButton';
ThinkingContent.displayName = 'ThinkingContent';
Thinking.displayName = 'Thinking';

export default memo(Thinking);
