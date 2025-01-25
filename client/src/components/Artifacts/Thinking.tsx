import { useState } from 'react';
import { Atom, ChevronDown } from 'lucide-react';
import type { MouseEvent } from 'react';
import useLocalize from '~/hooks/useLocalize';

interface ThinkingProps {
  children: React.ReactNode;
}

const Thinking = ({ children }: ThinkingProps) => {
  const localize = useLocalize();
  const [isExpanded, setIsExpanded] = useState(true);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsExpanded(!isExpanded);
  };

  if (children == null) {
    return null;
  }

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={handleClick}
        className="group mb-3 flex w-fit items-center justify-center rounded-xl bg-surface-tertiary px-3.5 py-2 text-xs leading-[18px] text-text-primary transition-colors hover:bg-surface-secondary"
      >
        <Atom size={14} className="mr-1.5 text-text-secondary" />
        {localize('com_ui_thoughts')}
        <ChevronDown
          className="icon-sm ml-1.5 text-text-primary transition-transform duration-200"
          style={{
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>
      {isExpanded && (
        <div className="relative pl-3 text-text-secondary">
          <div className="absolute left-0 top-[5px] h-[calc(100%-10px)] border-l-2 border-border-medium dark:border-border-heavy" />
          <p className="my-4 whitespace-pre-wrap leading-[26px]">{children}</p>
        </div>
      )}
    </div>
  );
};

export default Thinking;
