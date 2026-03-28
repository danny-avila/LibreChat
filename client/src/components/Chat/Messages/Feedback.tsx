import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import * as Ariakit from '@ariakit/react';
import { TFeedback, TFeedbackTag, getTagsForRating } from 'librechat-data-provider';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  ThumbUpIcon,
  ThumbDownIcon,
} from '@librechat/client';
import {
  AlertCircle,
  PenTool,
  ImageOff,
  Ban,
  HelpCircle,
  CheckCircle,
  Lightbulb,
  Search,
  MicOff,
  Mic,
} from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { FormProvider, useForm } from 'react-hook-form';

interface FeedbackProps {
  handleFeedback: ({ feedback }: { feedback: TFeedback | undefined }) => void;
  feedback?: TFeedback;
  isLast?: boolean;
}

interface FeedbackForm {
  text: string;
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
  active,
  onClick,
}: {
  tag: TFeedbackTag;
  active?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const localize = useLocalize();
  const Icon = ICONS[tag.icon as keyof typeof ICONS] || AlertCircle;
  const label = localize(tag.label as Parameters<typeof localize>[0]);

  return (
    <button
      className={cn(
        'flex w-full items-center gap-3 rounded-xl p-2 text-text-secondary transition-colors duration-200 hover:bg-surface-hover hover:text-text-primary',
        active && 'bg-surface-hover font-semibold text-text-primary',
      )}
      onClick={onClick}
      type="button"
      aria-label={label}
      aria-pressed={active}
    >
      <Icon size="19" bold={active} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

function FeedbackButtons({
  isLast,
  feedback,
  onFeedback,
  onOther,
}: {
  isLast: boolean;
  feedback?: TFeedback;
  onFeedback: (fb: TFeedback | undefined) => void;
  onOther?: () => void;
}) {
  const localize = useLocalize();
  const upStore = Ariakit.usePopoverStore({ placement: 'bottom' });
  const downStore = Ariakit.usePopoverStore({ placement: 'bottom' });

  const positiveTags = useMemo(() => getTagsForRating('thumbsUp'), []);
  const negativeTags = useMemo(() => getTagsForRating('thumbsDown'), []);

  const upActive = feedback?.rating === 'thumbsUp' ? feedback.tag?.key : undefined;
  const downActive = feedback?.rating === 'thumbsDown' ? feedback.tag?.key : undefined;

  const handleUp = (tag: TFeedbackTag) => {
    upStore.hide();
    onFeedback({ rating: 'thumbsUp', tag });
    if (tag.key === 'other') onOther?.();
  };

  const handleDown = (tag: TFeedbackTag) => {
    downStore.hide();
    onFeedback({ rating: 'thumbsDown', tag });
    if (tag.key === 'other') onOther?.();
  };

  return (
    <>
      <Ariakit.PopoverAnchor
        store={upStore}
        render={
          <button
            className={buttonClasses(feedback?.rating === 'thumbsUp', isLast)}
            onClick={() => upStore.toggle()}
            type="button"
            title={localize('com_ui_feedback_positive')}
            aria-pressed={feedback?.rating === 'thumbsUp'}
            aria-haspopup="menu"
          >
            <ThumbUpIcon size="19" bold={feedback?.rating === 'thumbsUp'} />
          </button>
        }
      />
      <Ariakit.Popover
        store={upStore}
        gutter={8}
        portal
        unmountOnHide
        className="popover-animate flex w-auto flex-col gap-1.5 overflow-hidden rounded-2xl border border-border-medium bg-surface-secondary p-1.5 shadow-lg"
      >
        <div className="flex flex-col items-stretch justify-center">
          {positiveTags.map((tag) => (
            <FeedbackOptionButton
              key={tag.key}
              tag={tag}
              active={upActive === tag.key}
              onClick={() => handleUp(tag)}
            />
          ))}
        </div>
      </Ariakit.Popover>

      <Ariakit.PopoverAnchor
        store={downStore}
        render={
          <button
            className={buttonClasses(feedback?.rating === 'thumbsDown', isLast)}
            onClick={() => downStore.toggle()}
            type="button"
            title={localize('com_ui_feedback_negative')}
            aria-pressed={feedback?.rating === 'thumbsDown'}
            aria-haspopup="menu"
          >
            <ThumbDownIcon size="19" bold={feedback?.rating === 'thumbsDown'} />
          </button>
        }
      />
      <Ariakit.Popover
        store={downStore}
        gutter={8}
        portal
        unmountOnHide
        className="popover-animate flex w-auto flex-col gap-1.5 overflow-hidden rounded-2xl border border-border-medium bg-surface-secondary p-1.5 shadow-lg"
      >
        <div className="flex flex-col items-stretch justify-center">
          {negativeTags.map((tag) => (
            <FeedbackOptionButton
              key={tag.key}
              tag={tag}
              active={downActive === tag.key}
              onClick={() => handleDown(tag)}
            />
          ))}
        </div>
      </Ariakit.Popover>
    </>
  );
}

function buttonClasses(isActive: boolean, isLast: boolean) {
  return cn(
    'hover-button rounded-lg p-1.5 text-text-secondary-alt',
    'hover:text-text-primary hover:bg-surface-hover',
    'md:group-hover:visible md:group-focus-within:visible md:group-[.final-completion]:visible',
    !isLast && 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
    'focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:outline-none',
    isActive && 'active text-text-primary bg-surface-hover',
  );
}

export default function Feedback({
  isLast = false,
  handleFeedback,
  feedback: initialFeedback,
}: FeedbackProps) {
  const localize = useLocalize();
  const [openDialog, setOpenDialog] = useState(false);
  const [feedback, setFeedback] = useState<TFeedback | undefined>(initialFeedback);
  const methods = useForm<FeedbackForm>({
    defaultValues: { text: '' },
  });
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const { ref: rhfRef, ...textRegister } = methods.register('text');
  /* init browser STT once */
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = true;

    rec.onstart = () => setIsListening(true);
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    rec.onresult = (e: any) => {
      let transcript = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      methods.setValue('text', transcript);
      setFeedback((prev) => (prev ? { ...prev, text: transcript } : prev));
    };

    recognitionRef.current = rec;
  }, [methods]);

  const toggleRecording = () => {
    if (!recognitionRef.current) return;
    isListening ? recognitionRef.current.stop() : recognitionRef.current.start();
  };

  useEffect(() => {
    setFeedback(initialFeedback);
    methods.setValue('text', initialFeedback?.text || '');
  }, [initialFeedback, methods]);

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
  const handleDialogSave = useCallback(() => {
    if (feedback?.tag?.key === 'other' && !feedback?.text?.trim()) {
      return;
    }
    handleFeedback({ feedback });
    propagateMinimal(feedback);
    setOpenDialog(false);
  }, [feedback, propagateMinimal, handleFeedback]);

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
      <button
        className={buttonClasses(true, isLast)}
        onClick={() => {
          if (isThumbsUp) {
            handleButtonFeedback(undefined);
          } else {
            setOpenDialog(true);
          }
        }}
        type="button"
        title={label}
        aria-pressed="true"
      >
        <Icon size="19" bold />
      </button>
    );
  };

  return (
    <>
      {feedback ? (
        renderSingleFeedbackButton()
      ) : (
        <FeedbackButtons
          isLast={isLast}
          feedback={feedback}
          onFeedback={handleButtonFeedback}
          onOther={handleOtherOpen}
        />
      )}
      <OGDialog open={openDialog} onOpenChange={setOpenDialog}>
        <FormProvider {...methods}>
          <OGDialogContent className="w-11/12 max-w-lg">
            <OGDialogTitle className="text-token-text-primary text-lg font-semibold leading-6">
              {localize('com_ui_feedback_more_information')}
            </OGDialogTitle>
            <textarea
              {...textRegister}
              ref={(el) => {
                textAreaRef.current = el;
                rhfRef(el);
              }}
              className="w-full rounded-xl border bg-transparent p-2"
              rows={4}
              placeholder={localize('com_ui_feedback_placeholder')}
            />
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={toggleRecording}
                className={cn(
                  'flex items-center gap-2 rounded-full px-3 py-2',
                  isListening ? 'bg-red-500/10 text-red-500' : 'hover:bg-surface-hover',
                )}
              >
                {isListening ? <MicOff size="18" /> : <Mic size="18" />}
                <span className="text-sm">
                  {isListening ? localize('com_ui_stop') : localize('com_ui_use_micrphone')}
                </span>
              </button>
            </div>
            <div className="mt-4 flex items-end justify-end gap-2">
              <Button variant="destructive" onClick={handleDialogClear}>
                {localize('com_ui_delete')}
              </Button>
              <Button
                variant="submit"
                onClick={handleDialogSave}
                disabled={!feedback?.text?.trim()}
              >
                {localize('com_ui_save')}
              </Button>
            </div>
          </OGDialogContent>
        </FormProvider>
      </OGDialog>
    </>
  );
}
