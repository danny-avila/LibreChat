import React, { useState } from 'react';
import FeedbackButtons from './FeedbackButtons';
import FeedbackTagOptions from './FeedbackTagOptions';
import { TFeedbackRating, TFeedbackContent, TMessageFeedback } from 'librechat-data-provider';

interface FeedbackProps {
  isLast?: boolean;
  handleFeedback: (rating: TFeedbackRating, content?: TFeedbackContent) => void;
  rating: TFeedbackRating;
  feedback?: TFeedbackContent;
}

export default function Feedback({
  isLast = false,
  handleFeedback,
  rating,
  feedback: feedbackContent,
}: FeedbackProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState<TMessageFeedback>({
    rating: rating,
    ratingContent: feedbackContent
      ? {
        tags: feedbackContent.tags,
        text: feedbackContent.text,
      }
      : undefined,
  });

  // Update parent and local state when feedback changes.
  const handleChange = (newFeedback: TMessageFeedback) => {
    setFeedback(newFeedback);
    handleFeedback(newFeedback.rating, newFeedback.ratingContent);
  };

  // Toggling logic:
  // - If the same rating is clicked, clear feedback (reset ratingContent to undefined) and do not open the dialog.
  // - If a different rating is selected, update rating and (for thumbsDown) open the dialog for tag options.
  const handleRatingClick = (newRating: TFeedbackRating) => {
    if (newRating === feedback.rating) {
      // Reset feedback when clicking the active button.
      handleFeedback(undefined, undefined);
      handleChange({ rating: undefined, ratingContent: undefined });
      setIsOpen(false);
    } else {
      handleChange({ rating: newRating, ratingContent: undefined });
      if (newRating === 'thumbsDown') {
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    }
  };

  return (
    <>
      <FeedbackTagOptions
        key={feedback.rating || 'none'}
        open={isOpen}
        onOpenChange={setIsOpen}
        feedback={feedback}
        onChange={handleChange}
      />
      <FeedbackButtons isLast={isLast} rating={feedback.rating} onFeedback={handleRatingClick} />
    </>
  );
}
