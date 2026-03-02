/* eslint-disable i18next/no-literal-string */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { useToastContext } from '@librechat/client';
import { socialDraftState } from '~/store/socialDraft';
import { useLocalize, useAuthContext } from '~/hooks';
import PostComposer from '~/components/Social/PostComposer';

const FUNCTION_NAME = 'Social Media Draft';

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  x: 'X (Twitter)',
  instagram: 'Instagram',
  facebook: 'Facebook',
  farcaster: 'Farcaster',
};

export type SocialDraftRecord = {
  _id: string;
  userId: string;
  drafts: Record<string, string>;
  resumeUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  rawIdea?: string;
  ideaId?: string;
  createdAt: string;
  updatedAt: string;
};

/** First 5 words from the first non-empty draft text, for list preview */
export function getDraftPreview(drafts: Record<string, string>, maxWords = 5): string {
  const firstText = Object.values(drafts).find((t) => t?.trim());
  if (!firstText?.trim()) return '—';
  const words = firstText.trim().split(/\s+/);
  const snippet = words.slice(0, maxWords).join(' ');
  return words.length > maxWords ? `${snippet}…` : snippet;
}

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
  const [pendingDrafts, setPendingDrafts] = useState<SocialDraftRecord[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [viewingDraftId, setViewingDraftId] = useState<string | null>(null);
  const [pollingForDraft, setPollingForDraft] = useState(false);
  const [showPostComposer, setShowPostComposer] = useState(false);
  const [selectedDraftContent, setSelectedDraftContent] = useState<string>('');
  const pendingCountRef = useRef(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { showToast } = useToastContext();
  const localize = useLocalize();
  const { token, isAuthenticated } = useAuthContext();

  const fetchPendingDrafts = useCallback(
    async (onFetched?: (list: SocialDraftRecord[]) => void, silent = false) => {
      if (!token) return;
      if (!silent) setLoadingPending(true);
      try {
        const res = await fetch('/api/social-drafts?status=pending', {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        });
        const data = await res.json();
        const list = data.success && Array.isArray(data.drafts) ? data.drafts : [];
        // During polling, don't replace with empty list—n8n may not have saved the new draft yet
        setPendingDrafts((prev) => {
          if (silent && list.length === 0) return prev;
          return list;
        });
        onFetched?.(list);
      } catch {
        // During polling (silent), keep previous list so we don't wipe the UI on transient errors
        if (!silent) {
          setPendingDrafts([]);
        }
        onFetched?.([]);
      } finally {
        if (!silent) setLoadingPending(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (state.isOpen && isAuthenticated && token) {
      fetchPendingDrafts();
    }
  }, [state.isOpen, isAuthenticated, token, fetchPendingDrafts]);

  // Clear polling when modal closes or unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      setPollingForDraft(false);
    };
  }, [state.isOpen]);

  const handleApprove = async (draft: SocialDraftRecord, approved: boolean) => {
    if (!token) return;
    setApprovingId(draft._id);
    
    try {
      if (approved) {
        // Get the first non-empty draft content
        const firstDraft = Object.values(draft.drafts).find((text) => text?.trim());
        
        // Open PostComposer immediately (don't wait for API)
        if (firstDraft) {
          setSelectedDraftContent(firstDraft);
          setShowPostComposer(true);
          close(); // Close the draft modal
          
          showToast({
            message: 'Opening post composer...',
            status: 'success',
          });
        }
      }
      
      // Call approval API in background (don't await)
      const platforms = approved
        ? Object.keys(draft.drafts).filter((k) => draft.drafts[k]?.trim())
        : [];
      
      fetch(`/api/social-drafts/${draft._id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({ approved, selectedPlatforms: platforms }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data.success) {
            console.error('Approval API failed:', data.error);
          }
          // Refresh pending drafts in background
          fetchPendingDrafts();
        })
        .catch((err) => {
          console.error('Approval API error:', err);
        });
      
      if (!approved) {
        showToast({
          message: 'Draft rejected.',
          status: 'success',
        });
        await fetchPendingDrafts();
      }
      
    } catch (err: unknown) {
      showToast({
        message: err instanceof Error ? err.message : 'Approve/reject failed',
        status: 'error',
      });
    } finally {
      setApprovingId(null);
    }
  };

  const close = () => {
    setDrafts(null);
    setViewingDraftId(null);
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
          showToast({
            message: 'Draft is being generated; it will appear in Pending drafts below.',
            status: 'success',
          });
          pendingCountRef.current = pendingDrafts.length;
          setPollingForDraft(true);
          if (pollingRef.current) clearInterval(pollingRef.current);
          const POLL_INTERVAL_MS = 2500;
          const POLL_MAX_MS = 45000;
          const start = Date.now();
          const checkNewDraft = (list: SocialDraftRecord[]) => {
            if (list.length > pendingCountRef.current) {
              if (pollingRef.current) clearInterval(pollingRef.current);
              pollingRef.current = null;
              setPollingForDraft(false);
              showToast({ message: 'Your draft is ready.', status: 'success' });
            }
          };
          fetchPendingDrafts(checkNewDraft, true);
          pollingRef.current = setInterval(() => {
            if (Date.now() - start >= POLL_MAX_MS) {
              if (pollingRef.current) clearInterval(pollingRef.current);
              pollingRef.current = null;
              setPollingForDraft(false);
              return;
            }
            fetchPendingDrafts(checkNewDraft, true);
          }, POLL_INTERVAL_MS);
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
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl dark:bg-surface-primary-alt">
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
              {(pendingDrafts.length > 0 || pollingForDraft) && (
                <div className="mb-6">
                  {pollingForDraft && (
                    <p className="mb-2 text-sm text-green-600 dark:text-green-400">
                      Draft is being generated; it will appear in Pending drafts below.
                    </p>
                  )}
                  <h4 className="mb-2 text-sm font-semibold text-black">
                    Pending drafts (approve to resume workflow)
                  </h4>
                  {loadingPending && !pollingForDraft ? (
                    <p className="text-sm text-text-secondary">Loading…</p>
                  ) : (
                    <ul className="space-y-3">
                      {pendingDrafts.map((d) => (
                        <li
                          key={d._id}
                          className="rounded-lg border border-border-light bg-surface-primary p-3 dark:border-border-medium dark:bg-surface-secondary"
                        >
                          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                            <span className="max-w-[70%] truncate text-sm font-medium text-black">
                              {getDraftPreview(d.drafts, 15)}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setViewingDraftId((id) => (id === d._id ? null : d._id))
                                }
                                className="rounded p-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                                title="View details"
                                aria-label="View draft details"
                              >
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  aria-hidden
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                  />
                                </svg>
                              </button>
                              <button
                                type="button"
                                disabled={approvingId === d._id}
                                onClick={() => handleApprove(d, true)}
                                className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                              >
                                {approvingId === d._id ? '…' : 'Approve'}
                              </button>
                              <button
                                type="button"
                                disabled={approvingId === d._id}
                                onClick={() => handleApprove(d, false)}
                                className="rounded border border-border-medium px-2 py-1 text-xs font-medium text-text-primary hover:bg-surface-hover disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-text-secondary">
                            {new Date(d.createdAt).toLocaleString()} ·{' '}
                            {Object.keys(d.drafts)
                              .filter((k) => d.drafts[k])
                              .join(', ') || '—'}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {viewingDraftId &&
                    (() => {
                      const draft = pendingDrafts.find((d) => d._id === viewingDraftId);
                      if (!draft) return null;
                      return (
                        <div className="mt-4 rounded-lg border border-border-medium bg-surface-secondary p-4 dark:bg-surface-primary">
                          <div className="mb-3 flex items-center justify-between">
                            <h5 className="text-sm font-semibold text-text-primary">
                              Draft details
                            </h5>
                            <button
                              type="button"
                              onClick={() => setViewingDraftId(null)}
                              className="rounded p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                              aria-label="Close details"
                            >
                              <svg
                                className="h-5 w-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </div>
                          <div className="max-h-64 space-y-3 overflow-y-auto">
                            {Object.entries(draft.drafts).map(
                              ([platform, text]) =>
                                text?.trim() && (
                                  <div
                                    key={platform}
                                    className="rounded border border-border-light bg-surface-primary p-3 dark:border-border-medium"
                                  >
                                    <span className="mb-1 block text-xs font-semibold text-text-primary">
                                      {PLATFORM_LABELS[platform] ?? platform}
                                    </span>
                                    <p className="whitespace-pre-wrap text-sm text-text-secondary">
                                      {text}
                                    </p>
                                  </div>
                                ),
                            )}
                          </div>
                        </div>
                      );
                    })()}
                </div>
              )}
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

      {/* Post Composer - Opens after draft approval */}
      <PostComposer
        isOpen={showPostComposer}
        onClose={() => {
          setShowPostComposer(false);
          setSelectedDraftContent('');
        }}
        initialContent={selectedDraftContent}
      />
    </div>
  );
}
