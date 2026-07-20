import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { OGDialog, OGDialogContent, OGDialogTitle } from '@librechat/client';
import { request } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks/AuthContext';

/**
 * BKL 항목 10: 공지/AI 정책 팝업.
 * 로그인/새로고침 시 활성 popup 공지를 조회해 미확인(localStorage ack) 공지를
 * 모달로 띄운다. persistable 공지는 확인 여부와 무관하게 매번 노출.
 *
 * 항목 5(b): 미응답 설문도 같은 인프라로 모달 푸시한다.
 */

type TNotice = {
  bannerId: string;
  title?: string | null;
  message: string;
  persistable?: boolean;
};

type TSurveyQuestion = {
  id: string;
  text: string;
  type: 'scale5' | 'choice' | 'text';
  options?: string[];
};

type TSurvey = {
  surveyId: string;
  title: string;
  description?: string | null;
  questions: TSurveyQuestion[];
};

const ACK_PREFIX = 'bkl_notice_ack_';
const SURVEY_DISMISS_PREFIX = 'bkl_survey_dismiss_';

function isAcked(bannerId: string) {
  try {
    return localStorage.getItem(ACK_PREFIX + bannerId) === '1';
  } catch {
    return false;
  }
}

function NoticeDialog({ notice, onClose }: { notice: TNotice; onClose: () => void }) {
  return (
    <OGDialog open onOpenChange={(open) => !open && onClose()}>
      <OGDialogContent className="w-11/12 max-w-lg">
        <OGDialogTitle>{notice.title || '공지'}</OGDialogTitle>
        <div className="prose dark:prose-invert max-h-[60vh] overflow-y-auto text-sm">
          <ReactMarkdown>{notice.message}</ReactMarkdown>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary rounded-lg px-4 py-2 text-sm"
          >
            확인
          </button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

function SurveyDialog({ survey, onClose }: { survey: TSurvey; onClose: () => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const setAnswer = (id: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [id]: value }));

  const submit = async () => {
    setSubmitting(true);
    try {
      await request.post('/api/bkl-survey/respond', {
        surveyId: survey.surveyId,
        answers,
      });
      onClose();
    } catch (err) {
      console.error('[BklSurvey] submit failed', err);
      setSubmitting(false);
    }
  };

  const dismiss = () => {
    try {
      /* 세션 동안만 미노출 (다음 로그인 시 재노출) */
      sessionStorage.setItem(SURVEY_DISMISS_PREFIX + survey.surveyId, '1');
    } catch {
      /* noop */
    }
    onClose();
  };

  return (
    <OGDialog open onOpenChange={(open) => !open && dismiss()}>
      <OGDialogContent className="w-11/12 max-w-lg">
        <OGDialogTitle>{survey.title}</OGDialogTitle>
        {survey.description ? (
          <p className="mb-2 text-sm text-text-secondary">{survey.description}</p>
        ) : null}
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          {survey.questions.map((question) => (
            <div key={question.id}>
              <div className="mb-1.5 text-sm font-medium">{question.text}</div>
              {question.type === 'scale5' ? (
                <div className="flex gap-2">
                  {['1', '2', '3', '4', '5'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAnswer(question.id, v)}
                      className={`h-9 w-9 rounded-full border text-sm transition-colors ${
                        answers[question.id] === v
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-border-medium hover:bg-surface-hover'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              ) : question.type === 'choice' ? (
                <div className="flex flex-col gap-1.5">
                  {(question.options ?? []).map((option) => (
                    <label key={option} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`bkl-survey-${question.id}`}
                        checked={answers[question.id] === option}
                        onChange={() => setAnswer(question.id, option)}
                      />
                      {option}
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  className="w-full rounded-lg border border-border-medium bg-transparent p-2 text-sm"
                  rows={3}
                  value={answers[question.id] ?? ''}
                  onChange={(e) => setAnswer(question.id, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover"
          >
            나중에
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || Object.keys(answers).length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            제출
          </button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

export default function BklNoticePopup() {
  const { isAuthenticated } = useAuthContext();
  const [notices, setNotices] = useState<TNotice[]>([]);
  const [surveys, setSurveys] = useState<TSurvey[]>([]);
  const [noticeIndex, setNoticeIndex] = useState(0);
  const [surveyIndex, setSurveyIndex] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = (await request.get('/api/banner/popup')) as { data?: TNotice[] };
        if (!cancelled) {
          setNotices(
            (res?.data ?? []).filter(
              (notice) => notice.persistable === true || !isAcked(notice.bannerId),
            ),
          );
        }
      } catch {
        /* 공지 API 실패는 무시 */
      }
      try {
        const res = (await request.get('/api/bkl-survey/active')) as { data?: TSurvey[] };
        if (!cancelled) {
          setSurveys(
            (res?.data ?? []).filter((survey) => {
              try {
                return sessionStorage.getItem(SURVEY_DISMISS_PREFIX + survey.surveyId) !== '1';
              } catch {
                return true;
              }
            }),
          );
        }
      } catch {
        /* 설문 API 실패는 무시 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const currentNotice = useMemo(() => notices[noticeIndex], [notices, noticeIndex]);
  const currentSurvey = useMemo(() => surveys[surveyIndex], [surveys, surveyIndex]);

  if (currentNotice) {
    return (
      <NoticeDialog
        notice={currentNotice}
        onClose={() => {
          if (currentNotice.persistable !== true) {
            try {
              localStorage.setItem(ACK_PREFIX + currentNotice.bannerId, '1');
            } catch {
              /* noop */
            }
          }
          setNoticeIndex((i) => i + 1);
        }}
      />
    );
  }

  if (currentSurvey) {
    return (
      <SurveyDialog survey={currentSurvey} onClose={() => setSurveyIndex((i) => i + 1)} />
    );
  }

  return null;
}
