import React from 'react';
import { cn } from '~/utils';

type FeedbackTagOptionsProps = {
  tagChoices: string[];
  onSelectTag: (tag: string) => void;
};

const FeedbackTagOptions: React.FC<FeedbackTagOptionsProps> = ({ tagChoices, onSelectTag }) => {
  return (
    <>
      <div className="pr-2 lg:pr-0"></div>
      <div className="mt-3 w-full empty:hidden">
        <div className="min-h-[96px] w-full" style={{ opacity: 1, willChange: 'auto' }}>
          <div className="relative mt-2 flex w-full flex-col gap-3 rounded-lg border border-token-border-light p-4">
            <button className="absolute right-4 top-4 text-sm font-bold">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="icon-md text-token-text-secondary hover:text-token-text-primary"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M5.63603 5.63604C6.02656 5.24552 6.65972 5.24552 7.05025 5.63604L12 10.5858L16.9497 5.63604C17.3403 5.24552 17.9734 5.24552 18.364 5.63604C18.7545 6.02657 18.7545 6.65973 18.364 7.05025L13.4142 12L18.364 16.9497C18.7545 17.3403 18.7545 17.9734 18.364 18.364C17.9734 18.7545 17.3403 18.7545 16.9497 18.364L12 13.4142L7.05025 18.364C6.65972 18.7545 6.02656 18.7545 5.63603 18.364C5.24551 17.9734 5.24551 17.3403 5.63603 16.9497L10.5858 12L5.63603 7.05025C5.24551 6.65973 5.24551 6.02657 5.63603 5.63604Z"
                  fill="currentColor"
                />
              </svg>
            </button>
            <div className="text-sm text-token-text-secondary">Tell us more:</div>
            <div className="flex flex-wrap gap-3">
              {tagChoices.map((tag) => (
                <button
                  key={tag}
                  onClick={() => onSelectTag(tag)}
                  aria-pressed="false"
                  aria-selected="false"
                  className="rounded-lg border border-token-border-light px-3 py-1 text-sm text-token-text-secondary hover:text-token-text-primary hover:bg-token-main-surface-secondary"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default FeedbackTagOptions;