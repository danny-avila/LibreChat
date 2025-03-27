import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '~/utils';
import {
  OGDialog,
  OGDialogContent,
  OGDialogTrigger,
  OGDialogHeader,
  OGDialogTitle,
} from '~/components';
import { useLocalize } from '~/hooks';
import type { TMessageFeedback, TFeedbackTag } from 'librechat-data-provider';
import { feedbackTags } from 'librechat-data-provider';

interface FeedbackTagOptionsProps {
  feedback: TMessageFeedback;
  onChange: (feedback: TMessageFeedback) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function FeedbackTagOptions({
  feedback,
  onChange,
  open,
  onOpenChange,
}: FeedbackTagOptionsProps) {
  const localize = useLocalize();
  const [localText, setLocalText] = useState('');
  const [hasTextChanged, setHasTextChanged] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [selectedTag, setSelectedTag] = useState<TFeedbackTag | null>(
    feedback.ratingContent?.tags?.[0] || null,
  );

  // Determine available tags based on the rating
  const tags = feedback.rating === 'thumbsDown' ? feedbackTags.thumbsDown : feedbackTags.thumbsUp;
  const inlineOptions = tags.slice(0, 3);
  const tagChoices = tags;
  const hasMore = tags.length > inlineOptions.length;

  // Sync local text and selected tag with feedback when it changes
  useEffect(() => {
    setLocalText(feedback.ratingContent?.text ?? '');
    setHasTextChanged(false);
    if (feedback.ratingContent?.tags && feedback.ratingContent.tags.length > 0) {
      setSelectedTag(feedback.ratingContent.tags[0]);
    } else {
      setSelectedTag(null);
    }
  }, [feedback.ratingContent?.text, feedback.ratingContent?.tags, open]);

  // Update text state
  const handleTextChange = (value: string) => {
    setLocalText(value);
    setHasTextChanged(true);
  };

  // Handle inline tag click – update immediately and dismiss inline view
  const handleInlineTagClick = (tag: TFeedbackTag) => {
    onChange({
      ...feedback,
      ratingContent: {
        tags: [tag],
        text: localText,
      },
    });
    setIsDismissed(true);
  };

  // Handle dialog submit – update with selected tag and text
  const handleSubmit = () => {
    if (selectedTag) {
      onChange({
        ...feedback,
        ratingContent: {
          tags: [selectedTag],
          text: localText,
        },
      });
    }
    onOpenChange(false);
  };

  if (!feedback.rating) {
    return null;
  }

  return (
    <>
      {/* Inline options – hidden once dismissed */}
      {!isDismissed && (
        <div className="relative mt-3 w-full">
          <div className="min-h-[96px] w-full">
            <div className="border-token-border-light relative mt-2 flex w-full flex-col gap-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="text-token-text-secondary text-sm">
                  {localize('com_ui_feedback_tag_options')}
                </div>
                <button
                  type="button"
                  onClick={() => setIsDismissed(true)}
                  className="text-token-text-secondary hover:text-token-text-primary text-xl"
                  aria-label="Dismiss feedback options"
                >
                  &times;
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                {inlineOptions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleInlineTagClick(tag)}
                    className="border-token-border-light text-token-text-secondary hover:text-token-text-primary hover:bg-token-main-surface-secondary rounded-lg border px-3 py-1 text-sm"
                  >
                    {localize(tag)}
                  </button>
                ))}
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(true);
                      setSelectedTag(null);
                      setLocalText('');
                    }}
                    className="border-token-border-light text-token-text-secondary hover:text-token-text-primary hover:bg-token-main-surface-secondary rounded-lg border px-3 py-1 text-sm"
                  >
                    {localize('com_ui_feedback_more')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dialog for additional feedback */}
      <OGDialog open={open} onOpenChange={onOpenChange}>
        <OGDialogTrigger asChild>
          {/* Invisible trigger */}
          <span />
        </OGDialogTrigger>
        <OGDialogContent className="w-11/12 max-w-xl">
          <OGDialogHeader>
            <OGDialogTitle className="text-token-text-primary text-lg font-semibold leading-6">
              {localize('com_ui_feedback_more_information')}
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
                      'border-token-border-light relative rounded-lg border px-3 py-1 text-sm',
                      selectedTag === tag
                        ? 'bg-token-main-surface-secondary text-token-text-primary'
                        : 'text-token-text-secondary hover:text-token-text-primary hover:bg-token-main-surface-secondary',
                    )}
                  >
                    {localize(tag)}
                    {selectedTag === tag && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white">
                        <Check className="h-4 w-4" />
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
                value={localText}
                onChange={(e) => handleTextChange(e.target.value)}
              />
            </div>
          </div>
          <div className="border-token-border-light flex w-full flex-row items-center justify-end border-t p-4">
            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <button
                type="button"
                onClick={handleSubmit}
                className={cn('btn btn-primary', !selectedTag && 'cursor-not-allowed opacity-50')}
                disabled={!selectedTag}
              >
                {localize('com_ui_submit')}
              </button>
            </div>
          </div>
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
