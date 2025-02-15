import React, { useState } from 'react';
import { cn } from '~/utils';
import {
  OGDialog,
  OGDialogContent,
  OGDialogTrigger,
  OGDialogHeader,
  OGDialogTitle,
} from '~/components';

type FeedbackTagOptionsProps = {
  tagChoices: string[];
  onSelectTag: (tag: string, text?: string) => void;
};

const FeedbackTagOptions: React.FC<FeedbackTagOptionsProps> = ({ tagChoices, onSelectTag }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [text, setText] = useState('');

  const inlineOptions = tagChoices.slice(0, 3);
  const hasMore = tagChoices.length > 3;

  const handleInlineTagClick = (tag: string) => {
    onSelectTag(tag);
  };

  const handleSubmit = () => {
    if (selectedTag) {
      onSelectTag(selectedTag, text);
      setIsDialogOpen(false);
    }
  };

  return (
    <>
      <div className="mt-3 w-full">
        <div className="min-h-[96px] w-full">
          <div className="relative mt-2 flex w-full flex-col gap-3 rounded-lg border border-token-border-light p-4">
            <div className="text-sm text-token-text-secondary">Tell us more:</div>
            <div className="flex flex-wrap gap-3">
              {inlineOptions.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleInlineTagClick(tag)}
                  className="rounded-lg border border-token-border-light px-3 py-1 text-sm text-token-text-secondary hover:text-token-text-primary hover:bg-token-main-surface-secondary"
                >
                  {tag}
                </button>
              ))}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => {
                    setIsDialogOpen(true);
                    setSelectedTag(null);
                    setText('');
                  }}
                  className="rounded-lg border border-token-border-light px-3 py-1 text-sm text-token-text-secondary hover:text-token-text-primary hover:bg-token-main-surface-secondary"
                >
                  More...
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dialog for additional feedback */}
      <OGDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <OGDialogTrigger asChild>
          {/* Invisible trigger */}
          <span />
        </OGDialogTrigger>
        <OGDialogContent className="w-11/12 max-w-xl">
          <OGDialogHeader>
            <OGDialogTitle className="text-lg font-semibold leading-6 text-token-text-primary">
              Provide additional feedback
            </OGDialogTitle>
          </OGDialogHeader>
          <div className="flex-grow overflow-y-auto p-4 sm:p-6">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap gap-3">
                {tagChoices.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedTag(tag)}
                    className={cn(
                      'relative rounded-lg border border-token-border-light px-3 py-1 text-sm',
                      selectedTag === tag
                        ? 'bg-token-main-surface-secondary text-token-text-primary'
                        : 'text-token-text-secondary hover:text-token-text-primary hover:bg-token-main-surface-secondary'
                    )}
                  >
                    {tag}
                    {selectedTag === tag && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white text-xs">
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6">
              <input
                id="feedback"
                aria-label="Additional feedback"
                type="text"
                placeholder="Additional Feedback (Optional)"
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring focus:ring-blue-200"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          </div>
          <div className="flex w-full flex-row items-center justify-end p-4 border-t border-token-border-light">
            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <button
                type="button"
                onClick={handleSubmit}
                className={cn('btn btn-primary', !selectedTag && 'opacity-50 cursor-not-allowed')}
                disabled={!selectedTag}
              >
                Submit
              </button>
            </div>
          </div>
        </OGDialogContent>
      </OGDialog>
    </>
  );
};

export default FeedbackTagOptions;