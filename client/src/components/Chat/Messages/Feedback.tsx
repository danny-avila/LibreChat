import React, { useState, useCallback, useMemo, useEffect } from 'react';
import * as Ariakit from '@ariakit/react';
import { getTagsForRating } from 'librechat-data-provider';
import {
  AlertCircle,
  PenTool,
  ImageOff,
  Ban,
  HelpCircle,
  CheckCircle,
  Lightbulb,
  Search,
} from 'lucide-react';
import {
  Button,
  OGDialog,
  Textarea,
  OGDialogContent,
  OGDialogTitle,
  TooltipAnchor,
  ThumbUpIcon,
  ThumbDownIcon,
} from '@librechat/client';
import type { TFeedback, TFeedbackRating, TFeedbackTag } from 'librechat-data-provider';
import { hoverButtonClasses } from './styles';
import { useLocalize } from '~/hooks';

interface FeedbackProps {
  handleFeedback: ({ feedback }: { feedback: TFeedback | undefined }) => void;
  feedback?: TFeedback;
  isLast?: boolean;
}

const ICONS = {
  AlertCircle,
  PenTool,
  ImageOff,
  Ban,
  HelpCircle,
  CheckCircle,
  Lightbulb,
  Search,
  ThumbsUp: ThumbUpIcon,
  ThumbsDown: ThumbDownIcon,
};

function FeedbackOptionButton({
  tag,
  onClick,
}: {
  tag: TFeedbackTag;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const localize = useLocalize();
  const Icon = ICONS[tag.icon as keyof typeof ICONS] || AlertCircle;
  const label = localize(tag.label as Parameters<typeof localize>[0]);

  return (
    <Button
      variant="ghost"
      className="h-auto w-full justify-start gap-3 rounded-xl p-2 text-text-secondary transition-colors duration-200 hover:bg-surface-hover hover:text-text-primary"
      onClick={onClick}
      aria-label={label}
    >
      <Icon size="19" aria-hidden="true" />
      <span>{label}</span>
    </Button>
  );
}

function FeedbackButtons({
  isLast,
  onFeedback,
  onOther,
}: {
  isLast: boolean;
  onFeedback: (fb: TFeedback | undefined) => void;
  onOther?: () => void;
}) {
  const localize = useLocalize();
  const hovercard = Ariakit.useHovercardStore({
    placement: 'top',
    showTimeout: 100,
    hideTimeout: 150,
  });
  const isOpen = hovercard.useState('open');
  const [rating, setRating] = useState<TFeedbackRating>();

  const positiveTags = useMemo(() => getTagsForRating('thumbsUp'), []);
  const negativeTags = useMemo(() => getTagsForRating('thumbsDown'), []);
  const tags = rating === 'thumbsUp' ? positiveTags : negativeTags;

  const handleOption = useCallback(
    (tag: TFeedbackTag) => (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!rating) {
        return;
      }
      hovercard.hide();
      onFeedback({ rating, tag });
      if (tag.key === 'other') {
        onOther?.();
      }
    },
    [hovercard, onFeedback, onOther, rating],
  );

  useEffect(() => {
    if (!isOpen) {
      setRating(undefined);
    }
  }, [isOpen]);

  return (
    <Ariakit.HovercardProvider store={hovercard}>
      <Ariakit.HovercardAnchor
        render={
          <Button
            variant="ghost"
            size="icon"
            className={buttonClasses(isOpen, isLast)}
            onClick={() => hovercard.toggle()}
            title={localize('com_ui_feedback_rate')}
            aria-label={localize('com_ui_feedback_rate')}
            aria-expanded={isOpen}
            aria-haspopup="dialog"
          >
            <span className="flex items-center -space-x-1" aria-hidden="true">
              <ThumbUpIcon size="16" />
              <ThumbDownIcon size="16" />
            </span>
          </Button>
        }
      />
      <Ariakit.Hovercard
        gutter={8}
        portal
        unmountOnHide
        aria-label={localize('com_ui_feedback_rate')}
        className="z-50 flex min-w-48 flex-col gap-1 overflow-hidden rounded-xl border border-border-light bg-surface-secondary p-1.5 text-text-primary shadow-lg outline-none"
      >
        {rating ? (
          tags.map((tag) => (
            <FeedbackOptionButton key={tag.key} tag={tag} onClick={handleOption(tag)} />
          ))
        ) : (
          <>
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-3 rounded-lg px-2.5 py-2 text-text-primary hover:bg-surface-hover"
              onClick={() => setRating('thumbsUp')}
            >
              <ThumbUpIcon size="19" aria-hidden="true" />
              <span>{localize('com_ui_feedback_good')}</span>
            </Button>
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-3 rounded-lg px-2.5 py-2 text-text-primary hover:bg-surface-hover"
              onClick={() => setRating('thumbsDown')}
            >
              <ThumbDownIcon size="19" aria-hidden="true" />
              <span>{localize('com_ui_feedback_bad')}</span>
            </Button>
          </>
        )}
      </Ariakit.Hovercard>
    </Ariakit.HovercardProvider>
  );
}

const buttonClasses = (isActive: boolean, isLast: boolean) =>
  hoverButtonClasses({ isActive, isLast });

export default function Feedback({
  isLast = false,
  handleFeedback,
  feedback: initialFeedback,
}: FeedbackProps) {
  const localize = useLocalize();
  const [openDialog, setOpenDialog] = useState(false);
  const [feedback, setFeedback] = useState<TFeedback | undefined>(initialFeedback);

  useEffect(() => {
    setFeedback(initialFeedback);
  }, [initialFeedback]);

  const propagateMinimal = useCallback(
    (fb: TFeedback | undefined) => {
      setFeedback(fb);
      handleFeedback({ feedback: fb });
    },
    [handleFeedback],
  );

  const handleButtonFeedback = useCallback(
    (fb: TFeedback | undefined) => {
      if (fb?.tag?.key === 'other') setOpenDialog(true);
      else setOpenDialog(false);
      propagateMinimal(fb);
    },
    [propagateMinimal],
  );

  const handleOtherOpen = useCallback(() => setOpenDialog(true), []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFeedback((prev) => (prev ? { ...prev, text: e.target.value } : undefined));
  };

  const handleDialogSave = useCallback(() => {
    if (feedback?.tag?.key === 'other' && !feedback?.text?.trim()) {
      return;
    }
    propagateMinimal(feedback);
    setOpenDialog(false);
  }, [feedback, propagateMinimal]);

  const handleDialogClear = useCallback(() => {
    setFeedback(undefined);
    handleFeedback({ feedback: undefined });
    setOpenDialog(false);
  }, [handleFeedback]);

  const renderSingleFeedbackButton = () => {
    if (!feedback) return null;
    const isThumbsUp = feedback.rating === 'thumbsUp';
    const Icon = isThumbsUp ? ThumbUpIcon : ThumbDownIcon;
    const label = isThumbsUp
      ? localize('com_ui_feedback_positive')
      : localize('com_ui_feedback_negative');
    return (
      <TooltipAnchor
        description={label}
        render={
          <Button
            variant="ghost"
            size="icon"
            className={buttonClasses(true, isLast)}
            onClick={() => {
              if (isThumbsUp) {
                handleButtonFeedback(undefined);
              } else {
                setOpenDialog(true);
              }
            }}
            aria-label={label}
            aria-pressed="true"
          >
            <Icon size="19" bold />
          </Button>
        }
      />
    );
  };

  return (
    <>
      {feedback ? (
        renderSingleFeedbackButton()
      ) : (
        <FeedbackButtons
          isLast={isLast}
          onFeedback={handleButtonFeedback}
          onOther={handleOtherOpen}
        />
      )}
      <OGDialog open={openDialog} onOpenChange={setOpenDialog}>
        <OGDialogContent className="w-11/12 max-w-lg">
          <OGDialogTitle className="text-token-text-primary text-lg font-semibold leading-6">
            {localize('com_ui_feedback_more_information')}
          </OGDialogTitle>
          <Textarea
            className="h-auto w-full rounded-xl border-border-light p-2"
            value={feedback?.text || ''}
            onChange={handleTextChange}
            rows={4}
            placeholder={localize('com_ui_feedback_placeholder')}
            maxLength={500}
          />
          <div className="mt-4 flex items-end justify-end gap-2">
            <Button variant="destructive" onClick={handleDialogClear}>
              {localize('com_ui_delete')}
            </Button>
            <Button variant="submit" onClick={handleDialogSave} disabled={!feedback?.text?.trim()}>
              {localize('com_ui_save')}
            </Button>
          </div>
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
