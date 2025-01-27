import { useState, useMemo, memo, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { Atom, ChevronDown } from 'lucide-react';
import type { MouseEvent, FC } from 'react';
import { useLocalize } from '~/hooks';
import store from '~/store';

const ThinkingContent: FC<{ children: React.ReactNode }> = memo(({ children }) => (
  <div className="relative pl-3 text-text-secondary">
    <div className="absolute left-0 h-[calc(100%-10px)] border-l-2 border-border-medium dark:border-border-heavy" />
    <p className="whitespace-pre-wrap leading-[26px]">{children}</p>
  </div>
));

const ThinkingButton = memo(
  ({
    isExpanded,
    onClick,
    label,
  }: {
    isExpanded: boolean;
    onClick: (e: MouseEvent<HTMLButtonElement>) => void;
    label: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className="group mt-3 flex w-fit items-center justify-center rounded-xl bg-surface-tertiary px-3.5 py-2 text-xs leading-[18px]"
    >
      <Atom size={14} className="mr-1.5 text-text-secondary" />
      {label}
      <ChevronDown
        className={`icon-sm ml-1.5 transform-gpu text-text-primary transition-transform duration-200 ${
          isExpanded ? 'rotate-180' : ''
        }`}
      />
    </button>
  ),
);

const Thinking: FC<{ children: React.ReactNode }> = memo(({ children }) => {
  const localize = useLocalize();
  const [showThinking] = useRecoilState<boolean>(store.showThinking);
  const [isExpanded, setIsExpanded] = useState(showThinking);

  const handleClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsExpanded((prev) => !prev);
  }, []);

  const label = useMemo(() => localize('com_ui_thoughts'), [localize]);

  if (!children) {
    return null;
  }

  return (
    <div className="mb-3">
      <ThinkingButton isExpanded={isExpanded} onClick={handleClick} label={label} />
      <div
        className="grid  transition-all duration-300 ease-out"
        style={{
          gridTemplateRows: isExpanded ? '1fr' : '0fr',
        }}
      >
        <div className="overflow-hidden">
          <ThinkingContent>{children}</ThinkingContent>
        </div>
      </div>
    </div>
  );
});

ThinkingButton.displayName = 'ThinkingButton';
ThinkingContent.displayName = 'ThinkingContent';
Thinking.displayName = 'Thinking';

export default memo(Thinking);
