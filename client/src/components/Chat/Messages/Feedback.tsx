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

  const handleChange = (newFeedback: TMessageFeedback) => {
    setFeedback(newFeedback);
    handleFeedback(newFeedback.rating, newFeedback.ratingContent);
  };

  const handleRatingClick = (newRating: TFeedbackRating) => {
    if (newRating === feedback.rating) {
      setIsOpen(true);
      return;
    }
    handleChange({
      rating: newRating,
      ratingContent: undefined,
    });
    setIsOpen(true);
  };

  return (
    <>
      <FeedbackTagOptions
        open={isOpen}
        onOpenChange={setIsOpen}
        feedback={feedback}
        onChange={handleChange}
      />
      <FeedbackButtons isLast={isLast} rating={feedback.rating} onFeedback={handleRatingClick} />
    </>
  );
}
