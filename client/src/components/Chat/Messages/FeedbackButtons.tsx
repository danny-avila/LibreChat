import React from 'react';
// import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { ThumbUpIcon, ThumbDownIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { TFeedbackRating } from 'librechat-data-provider/dist/types';

interface FeedbackButtonsProps {
  isLast: boolean;
  rating: TFeedbackRating;
  onFeedback: (rating: TFeedbackRating) => void;
}

export default function FeedbackButtons({ isLast, rating, onFeedback }: FeedbackButtonsProps) {
  const localize = useLocalize();
  const buttonClasses = (isActive: boolean) =>
    cn(
      'hover-button rounded-lg p-1.5',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white',

      'hover:bg-gray-100 hover:text-gray-500',
      'data-[state=open]:active data-[state=open]:bg-gray-100 data-[state=open]:text-gray-500',

      isActive ? 'text-gray-500 dark:text-gray-200' : 'dark:text-gray-400/70',

      'dark:hover:bg-gray-700 dark:hover:text-gray-200',
      'data-[state=open]:dark:bg-gray-700 data-[state=open]:dark:text-gray-200',
      'disabled:dark:hover:text-gray-400',

      isLast
        ? ''
        : 'data-[state=open]:opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100',

      'md:group-focus-within:visible md:group-hover:visible md:group-[.final-completion]:visible',
    );

  return (
    <>
      <button
        className={buttonClasses(rating === 'thumbsUp')}
        onClick={() => onFeedback('thumbsUp')}
        type="button"
        title={localize('com_ui_feedback_positive')}
      >
        <ThumbUpIcon size="19" bold={rating === 'thumbsUp'} />
      </button>

      <button
        className={buttonClasses(rating === 'thumbsDown')}
        onClick={() => onFeedback('thumbsDown')}
        type="button"
        title={localize('com_ui_feedback_negative')}
      >
        <ThumbDownIcon size="19" bold={rating === 'thumbsDown'} />
      </button>
    </>
  );
}
