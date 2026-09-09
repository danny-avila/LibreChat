import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  OGDialog,
  DialogTemplate,
  Checkbox,
  TextareaAutosize,
  cn,
  useToastContext,
} from '@librechat/client';
import type { TQuestionnaireAnswer, TQuestionnaireQuestion } from 'librechat-data-provider';
import {
  useGetQuestionnaireQuery,
  useSubmitQuestionnaireResponseMutation,
  useDismissQuestionnaireMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';

const REPROMPT_FALLBACK_HOURS = 24;
const FALLBACK_QUESTIONS_PER_PAGE = 4;

type AnswerValue = string | number | string[];

type QuestionnairePage = {
  section?: string;
  questions: TQuestionnaireQuestion[];
};

const formatReprompt = (hours: number): string => {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? '1 day' : `${days} days`;
  }
  return hours === 1 ? '1 hour' : `${hours} hours`;
};

const isAnswered = (value: AnswerValue | undefined): boolean => {
  if (value == null || value === '') {
    return false;
  }
  return !Array.isArray(value) || value.length > 0;
};

const buildPages = (questions: TQuestionnaireQuestion[]): QuestionnairePage[] => {
  if (questions.every((question) => !question.section)) {
    const pages: QuestionnairePage[] = [];
    for (let i = 0; i < questions.length; i += FALLBACK_QUESTIONS_PER_PAGE) {
      pages.push({ questions: questions.slice(i, i + FALLBACK_QUESTIONS_PER_PAGE) });
    }
    return pages;
  }

  return questions.reduce<QuestionnairePage[]>((pages, question) => {
    const current = pages[pages.length - 1];
    if (current && current.section === question.section) {
      current.questions.push(question);
    } else {
      pages.push({ section: question.section, questions: [question] });
    }
    return pages;
  }, []);
};

const ScaleQuestion = ({
  question,
  value,
  onChange,
}: {
  question: TQuestionnaireQuestion;
  value: number | undefined;
  onChange: (value: number) => void;
}) => {
  const min = question.min ?? 1;
  const max = question.max ?? 5;
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring-primary',
              value === option
                ? 'border-green-600 bg-green-600 text-white'
                : 'border-border-medium bg-surface-secondary text-text-primary hover:border-border-heavy hover:bg-surface-active',
            )}
          >
            {option}
          </button>
        ))}
      </div>
      {(question.minLabel || question.maxLabel) && (
        <div className="flex justify-between text-xs text-text-secondary">
          <span>{question.minLabel}</span>
          <span>{question.maxLabel}</span>
        </div>
      )}
    </div>
  );
};

const SingleChoiceQuestion = ({
  question,
  value,
  onChange,
}: {
  question: TQuestionnaireQuestion;
  value: string | undefined;
  onChange: (value: string) => void;
}) => (
  <div className="flex flex-wrap gap-2">
    {(question.options ?? []).map((option) => (
      <button
        key={option}
        type="button"
        aria-pressed={value === option}
        onClick={() => onChange(option)}
        className={cn(
          'rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring-primary',
          value === option
            ? 'border-green-600 bg-green-600 text-white'
            : 'border-border-medium bg-surface-secondary text-text-primary hover:border-border-heavy hover:bg-surface-active',
        )}
      >
        {option}
      </button>
    ))}
  </div>
);

const MultipleChoiceQuestion = ({
  question,
  value,
  onChange,
}: {
  question: TQuestionnaireQuestion;
  value: string[];
  onChange: (value: string[]) => void;
}) => {
  const toggle = (option: string) => {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option));
      return;
    }
    onChange([...value, option]);
  };

  return (
    <div className="flex flex-col gap-2">
      {(question.options ?? []).map((option) => {
        const checked = value.includes(option);
        return (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-2 text-sm text-text-primary"
          >
            <Checkbox
              checked={checked}
              onCheckedChange={() => toggle(option)}
              aria-label={option}
            />
            <span className="capitalize">{option}</span>
          </label>
        );
      })}
    </div>
  );
};

const TextQuestion = ({
  question,
  value,
  onChange,
}: {
  question: TQuestionnaireQuestion;
  value: string | undefined;
  onChange: (value: string) => void;
}) => (
  <TextareaAutosize
    aria-label={question.title}
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value)}
    minRows={2}
    maxRows={8}
    className="w-full resize-none rounded-lg border border-border-medium bg-surface-secondary px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring-primary"
  />
);

const NumericQuestion = ({
  question,
  value,
  onChange,
}: {
  question: TQuestionnaireQuestion;
  value: number | undefined;
  onChange: (value: number) => void;
}) => (
  <input
    type="number"
    aria-label={question.title}
    min={question.min}
    max={question.max}
    value={value ?? ''}
    onChange={(e) => onChange(Number(e.target.value))}
    className="w-32 rounded-lg border border-border-medium bg-surface-secondary px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring-primary"
  />
);

export default function QuestionnaireModal() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data } = useGetQuestionnaireQuery();
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const questionnaire = data?.questionnaire ?? null;
  const completed = data?.completed ?? false;
  const dismissible = questionnaire?.dismissible !== false;
  const showConfetti = questionnaire?.showConfetti !== false;
  const permanentDismiss = questionnaire?.repromptIntervalHours == null;

  const pages = useMemo(
    () => (questionnaire ? buildPages(questionnaire.questions) : []),
    [questionnaire],
  );

  const shouldShow = useMemo(() => {
    if (!questionnaire || completed) {
      return false;
    }
    if (!data?.dismissedAt) {
      return true;
    }
    if (questionnaire.repromptIntervalHours == null) {
      return false;
    }
    const repromptMs =
      (questionnaire.repromptIntervalHours || REPROMPT_FALLBACK_HOURS) * 60 * 60 * 1000;
    return Date.now() - new Date(data.dismissedAt).getTime() >= repromptMs;
  }, [questionnaire, completed, data?.dismissedAt]);

  useEffect(() => {
    if (shouldShow) {
      setOpen(true);
      setSubmitted(false);
      setAnswers({});
      setPageIndex(0);
      setShowErrors(false);
    }
  }, [shouldShow]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pageIndex]);

  const submitMutation = useSubmitQuestionnaireResponseMutation({
    onSuccess: () => {
      setSubmitted(true);
      if (showConfetti) {
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
        });
      }
    },
    onError: () => {
      showToast({ message: localize('com_ui_questionnaire_submit_error'), status: 'error' });
    },
  });

  const dismissMutation = useDismissQuestionnaireMutation();

  if (!questionnaire || !open || pages.length === 0) {
    return null;
  }

  const repromptLabel = permanentDismiss
    ? null
    : formatReprompt(questionnaire.repromptIntervalHours ?? REPROMPT_FALLBACK_HOURS);
  const currentPage = pages[Math.min(pageIndex, pages.length - 1)];
  const isLastPage = pageIndex >= pages.length - 1;
  const requiredCount = questionnaire.questions.filter((question) => question.required).length;
  const answeredRequired = questionnaire.questions.filter(
    (question) => question.required && isAnswered(answers[question.id]),
  ).length;
  const progress = requiredCount > 0 ? answeredRequired / requiredCount : pageIndex / pages.length;

  const handleDismiss = () => {
    if (!dismissible) {
      return;
    }
    setOpen(false);
    dismissMutation.mutate({ questionnaireId: questionnaire.questionnaireId });
    showToast({
      message: permanentDismiss
        ? localize('com_ui_questionnaire_dismissed_permanent_toast')
        : localize('com_ui_questionnaire_dismissed_toast', { 0: repromptLabel ?? '' }),
      status: 'info',
    });
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setOpen(true);
      return;
    }
    if (submitted) {
      setOpen(false);
      return;
    }
    if (dismissible) {
      handleDismiss();
    }
  };

  const handleChange = (questionId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const missingOnPage = currentPage.questions.filter(
    (question) => question.required === true && !isAnswered(answers[question.id]),
  );

  const handleSubmit = () => {
    const payloadAnswers: TQuestionnaireAnswer[] = Object.entries(answers).map(
      ([questionId, value]) => ({ questionId, value }),
    );

    submitMutation.mutate({
      questionnaireId: questionnaire.questionnaireId,
      answers: payloadAnswers,
    });
  };

  const handleNext = () => {
    if (missingOnPage.length > 0) {
      setShowErrors(true);
      showToast({ message: localize('com_ui_questionnaire_required'), status: 'error' });
      return;
    }
    setShowErrors(false);
    if (isLastPage) {
      handleSubmit();
      return;
    }
    setPageIndex((prev) => prev + 1);
  };

  const secondaryButtonClasses =
    'inline-flex h-10 items-center justify-center rounded-lg border border-border-medium bg-surface-secondary px-4 py-2 text-sm text-text-primary transition-colors hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring-primary';

  return (
    <OGDialog open={open} onOpenChange={handleOpenChange}>
      <DialogTemplate
        title={questionnaire.title}
        className="w-11/12 max-w-2xl sm:w-3/4 md:w-2/3"
        showCloseButton={false}
        showCancelButton={false}
        onOpenAutoFocus={(event) => event.preventDefault()}
        main={
          submitted ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-base font-medium text-text-primary">
                {questionnaire.thankYouMessage ||
                  localize('com_ui_questionnaire_thank_you_default')}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  {currentPage.section != null && (
                    <span className="text-sm font-medium text-text-primary">
                      {currentPage.section}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-text-secondary">
                    {localize('com_ui_questionnaire_step', {
                      0: String(pageIndex + 1),
                      1: String(pages.length),
                    })}
                  </span>
                </div>
                <div
                  className="h-1 w-full overflow-hidden rounded-full bg-surface-tertiary"
                  role="progressbar"
                  aria-valuenow={Math.round(progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-green-500 transition-all duration-300"
                    style={{ width: `${Math.max(progress * 100, 2)}%` }}
                  />
                </div>
              </div>

              {pageIndex === 0 && questionnaire.intro && (
                <p className="text-sm text-text-secondary">{questionnaire.intro}</p>
              )}

              <div
                ref={scrollRef}
                className="flex max-h-[50vh] flex-col gap-6 overflow-y-auto px-1 py-1"
              >
                {currentPage.questions.map((question) => {
                  const missing =
                    showErrors === true &&
                    question.required === true &&
                    !isAnswered(answers[question.id]);
                  return (
                    <div key={question.id} className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-text-primary">
                        {question.title}
                        {question.required && (
                          <span className="ml-1 text-red-500" aria-hidden="true">
                            *
                          </span>
                        )}
                      </label>
                      {question.description && (
                        <p className="text-xs text-text-secondary">{question.description}</p>
                      )}
                      {question.type === 'scale' && (
                        <ScaleQuestion
                          question={question}
                          value={answers[question.id] as number | undefined}
                          onChange={(value) => handleChange(question.id, value)}
                        />
                      )}
                      {question.type === 'numeric' && (
                        <NumericQuestion
                          question={question}
                          value={answers[question.id] as number | undefined}
                          onChange={(value) => handleChange(question.id, value)}
                        />
                      )}
                      {question.type === 'single_choice' && (
                        <SingleChoiceQuestion
                          question={question}
                          value={answers[question.id] as string | undefined}
                          onChange={(value) => handleChange(question.id, value)}
                        />
                      )}
                      {question.type === 'multiple_choice' && (
                        <MultipleChoiceQuestion
                          question={question}
                          value={(answers[question.id] as string[] | undefined) ?? []}
                          onChange={(value) => handleChange(question.id, value)}
                        />
                      )}
                      {question.type === 'text' && (
                        <TextQuestion
                          question={question}
                          value={answers[question.id] as string | undefined}
                          onChange={(value) => handleChange(question.id, value)}
                        />
                      )}
                      {missing && (
                        <p className="text-xs text-red-500">
                          {localize('com_ui_questionnaire_required')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {dismissible && (
                <div className="flex flex-col gap-1.5 border-t border-border-light pt-3 text-xs text-text-secondary">
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                    {permanentDismiss
                      ? localize('com_ui_questionnaire_remind_later_permanent')
                      : localize('com_ui_questionnaire_remind_later', {
                          0: repromptLabel ?? '',
                        })}
                  </span>
                </div>
              )}
            </div>
          )
        }
        buttons={
          submitted ? (
            <button onClick={() => setOpen(false)} className={secondaryButtonClasses}>
              {localize('com_ui_close')}
            </button>
          ) : (
            <>
              {dismissible && (
                <button onClick={handleDismiss} className={secondaryButtonClasses}>
                  {localize('com_ui_questionnaire_dismiss')}
                </button>
              )}
              {pageIndex > 0 && (
                <button
                  onClick={() => {
                    setShowErrors(false);
                    setPageIndex((prev) => prev - 1);
                  }}
                  className={secondaryButtonClasses}
                >
                  {localize('com_ui_back')}
                </button>
              )}
              <button
                onClick={handleNext}
                disabled={submitMutation.isLoading}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-green-600 bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-green-700 hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLastPage ? localize('com_ui_submit') : localize('com_ui_next')}
              </button>
            </>
          )
        }
      />
    </OGDialog>
  );
}
