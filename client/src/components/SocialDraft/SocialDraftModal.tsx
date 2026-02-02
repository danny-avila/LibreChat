import React, { useState } from 'react';
import { useRecoilState } from 'recoil';
import { useToastContext } from '@librechat/client';
import { socialDraftState } from '~/store/socialDraft';
import { useLocalize, useAuthContext } from '~/hooks';

const FUNCTION_NAME = 'Social Media Draft';

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  x: 'X (Twitter)',
  instagram: 'Instagram',
  facebook: 'Facebook',
  farcaster: 'Farcaster',
};

/** Normalize n8n response into { linkedin?, x?, instagram?, facebook?, ... } */
function getDraftsFromResponse(data: any): Record<string, string> {
  const drafts: Record<string, string> = {};
  const payload = data?.data ?? data;

  // Prefer explicit drafts object from n8n
  if (payload?.drafts && typeof payload.drafts === 'object') {
    return { ...payload.drafts };
  }

  // Fallback: parse current n8n "Message a model" output shape
  const output = payload?.output;
  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    const content = first?.content;
    if (Array.isArray(content) && content.length > 0) {
      const text = content[0]?.text ?? content[0]?.message?.content ?? '';
      if (text) drafts.linkedin = text;
    }
  }

  return drafts;
}

export default function SocialDraftModal() {
  const [state, setState] = useRecoilState(socialDraftState);
  const [rawIdea, setRawIdea] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string> | null>(null);
  const { showToast } = useToastContext();
  const localize = useLocalize();
  const { token, isAuthenticated } = useAuthContext();

  const close = () => {
    setDrafts(null);
    setState({ isOpen: false });
  };

  const startAnother = () => {
    setDrafts(null);
    setRawIdea('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = rawIdea.trim();
    if (!trimmed) {
      showToast({ message: 'Please enter your idea.', status: 'error' });
      return;
    }
    if (!isAuthenticated || !token) {
      showToast({ message: 'Please log in again to use this feature.', status: 'error' });
      return;
    }
    setIsSubmitting(true);
    setDrafts(null);
    try {
      const response = await fetch('/api/n8n-tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          functionName: FUNCTION_NAME,
          parameters: { rawIdea: trimmed },
        }),
      });
      const data = await response.json();

      if (data.success) {
        const parsed = getDraftsFromResponse(data);
        if (Object.keys(parsed).length > 0) {
          setDrafts(parsed);
          showToast({ message: 'Drafts ready.', status: 'success' });
        } else {
          showToast({ message: 'Drafts generated. No content to display yet.', status: 'info' });
          close();
        }
      } else {
        throw new Error(data.error?.message || data.error || 'Execution failed');
      }
    } catch (err: any) {
      showToast({ message: err?.message || 'Failed to start social draft.', status: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!state.isOpen) return null;

  const showResults = drafts && Object.keys(drafts).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl dark:bg-surface-primary-alt">
        <div className="flex items-center justify-between border-b border-border-light p-4 dark:border-border-medium">
          <h3 className="text-lg font-bold text-text-primary">
            {showResults ? 'Your drafts' : localize('com_sidepanel_social_draft')}
          </h3>
          <button
            type="button"
            onClick={close}
            className="rounded p-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="max-h-[calc(90vh-8rem)] overflow-y-auto p-4">
          {showResults ? (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                Copy the draft you need. You can edit before posting.
              </p>
              {Object.entries(drafts).map(([platform, text]) => (
                <div
                  key={platform}
                  className="rounded-lg border border-border-light bg-surface-primary p-4 dark:border-border-medium dark:bg-surface-secondary"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-text-primary">
                      {PLATFORM_LABELS[platform] ?? platform}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(text);
                        showToast({ message: 'Copied to clipboard', status: 'success' });
                      }}
                      className="rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-500/10"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-text-primary">{text}</p>
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={startAnother}
                  className="rounded-lg border border-border-medium px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
                >
                  Start another
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-text-secondary">
                Enter your raw idea. n8n will generate drafts for LinkedIn, X, Instagram, Facebook,
                and more.
              </p>
              <form onSubmit={handleSubmit} className="space-y-3">
                <textarea
                  className="w-full rounded-lg border border-border-light bg-surface-primary p-3 text-text-primary placeholder:text-text-secondary focus:border-border-medium focus:outline-none dark:border-border-medium dark:bg-surface-secondary"
                  placeholder="e.g. Launching our new product next week – focus on reliability and ease of use"
                  rows={4}
                  value={rawIdea}
                  onChange={(e) => setRawIdea(e.target.value)}
                  required
                />
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-lg border border-border-medium px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Generating…' : 'Generate drafts'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
