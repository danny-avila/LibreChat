/* eslint-disable i18next/no-literal-string */
import React, { useState, useEffect, useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import { useToastContext } from '@librechat/client';
import { useAuthContext } from '~/hooks';
import postComposerState from '~/store/postComposer';
import { socialDraftState } from '~/store/socialDraft';
import { getDraftPreview, type SocialDraftRecord } from '~/components/SocialDraft/SocialDraftModal';
import { Trash2, Eye, Plus, Send } from 'lucide-react';

type Tab = 'pending' | 'approved';

export default function SocialMediaPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [pendingDrafts, setPendingDrafts] = useState<SocialDraftRecord[]>([]);
  const [approvedDrafts, setApprovedDrafts] = useState<SocialDraftRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingDraftId, setViewingDraftId] = useState<string | null>(null);
  const { token, isAuthenticated } = useAuthContext();
  const { showToast } = useToastContext();
  const setPostComposerState = useSetRecoilState(postComposerState);
  const setSocialDraftState = useSetRecoilState(socialDraftState);

  const PLATFORM_LABELS: Record<string, string> = {
    linkedin: 'LinkedIn',
    x: 'X (Twitter)',
    instagram: 'Instagram',
    facebook: 'Facebook',
    farcaster: 'Farcaster',
  };

  const fetchDrafts = useCallback(async () => {
    if (!token || !isAuthenticated) return;
    setLoading(true);
    try {
      const [pendingRes, approvedRes] = await Promise.all([
        fetch('/api/social-drafts?status=pending', {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        }),
        fetch('/api/social-drafts?status=approved', {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        }),
      ]);
      const pendingData = await pendingRes.json();
      const approvedData = await approvedRes.json();
      setPendingDrafts(pendingData.success ? pendingData.drafts : []);
      setApprovedDrafts(approvedData.success ? approvedData.drafts : []);
    } catch {
      setPendingDrafts([]);
      setApprovedDrafts([]);
    } finally {
      setLoading(false);
    }
  }, [token, isAuthenticated]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const handleDelete = async (draftId: string) => {
    if (!token) return;
    setDeletingId(draftId);
    try {
      const res = await fetch(`/api/social-drafts/${draftId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        showToast({ message: 'Draft deleted', status: 'success' });
        fetchDrafts();
      } else {
        showToast({ message: data.error || 'Failed to delete draft', status: 'error' });
      }
    } catch {
      showToast({ message: 'Failed to delete draft', status: 'error' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenDraft = (draft: SocialDraftRecord, isApproved: boolean) => {
    if (isApproved) {
      const firstDraft = Object.values(draft.drafts).find((text) => text?.trim());
      if (firstDraft) {
        setPostComposerState({ isOpen: true, initialContent: firstDraft });
      }
    } else {
      setSocialDraftState({ isOpen: true });
    }
  };

  const handleNewDraft = () => {
    setSocialDraftState({ isOpen: true });
  };

  const drafts = activeTab === 'pending' ? pendingDrafts : approvedDrafts;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-light p-3 dark:border-border-medium">
        <h2 className="text-sm font-semibold text-text-primary">Social Media</h2>
        <button
          onClick={handleNewDraft}
          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-700"
          title="Create new draft"
        >
          <Plus className="h-3.5 w-3.5" />
          New Draft
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-light dark:border-border-medium">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === 'pending'
              ? 'border-b-2 border-green-600 text-green-600'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Pending
          {pendingDrafts.length > 0 && (
            <span className="ml-1.5 rounded-full bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
              {pendingDrafts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('approved')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === 'approved'
              ? 'border-b-2 border-green-600 text-green-600'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Approved
          {approvedDrafts.length > 0 && (
            <span className="ml-1.5 rounded-full bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
              {approvedDrafts.length}
            </span>
          )}
        </button>
      </div>

      {/* Draft List */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="py-6 text-center text-xs text-text-secondary">Loading…</p>
        ) : drafts.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs text-text-secondary">
              {activeTab === 'pending' ? 'No pending drafts' : 'No approved drafts'}
            </p>
            {activeTab === 'pending' && (
              <button
                onClick={handleNewDraft}
                className="mt-3 text-xs text-green-600 hover:underline"
              >
                Create your first draft
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {drafts.map((draft) => (
              <li
                key={draft._id}
                className="rounded-lg border border-border-light bg-surface-primary p-2.5 dark:border-border-medium dark:bg-surface-secondary"
              >
                <div className="mb-1 flex items-start justify-between gap-1">
                  <span className="line-clamp-2 flex-1 text-xs text-text-primary">
                    {getDraftPreview(draft.drafts, 12)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {/* View / Open */}
                    <button
                      onClick={() => setViewingDraftId((id) => (id === draft._id ? null : draft._id))}
                      className="rounded p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      title="View draft"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {/* Post (approved only) */}
                    {activeTab === 'approved' && (
                      <button
                        onClick={() => handleOpenDraft(draft, true)}
                        className="rounded p-1 text-green-600 hover:bg-green-500/10"
                        title="Post to social media"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(draft._id)}
                      disabled={deletingId === draft._id}
                      className="rounded p-1 text-text-secondary hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                      title="Delete draft"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-text-secondary">
                  {Object.keys(draft.drafts).filter((k) => draft.drafts[k]).join(', ') || '—'} ·{' '}
                  {new Date(draft.createdAt).toLocaleDateString()}
                </p>

                {/* Expanded view */}
                {viewingDraftId === draft._id && (
                  <div className="mt-2 space-y-2 border-t border-border-light pt-2 dark:border-border-medium">
                    {Object.entries(draft.drafts).map(
                      ([platform, text]) =>
                        text?.trim() && (
                          <div key={platform}>
                            <span className="text-xs font-semibold text-text-secondary">
                              {PLATFORM_LABELS[platform] ?? platform}
                            </span>
                            <p className="mt-0.5 whitespace-pre-wrap text-xs text-text-primary">
                              {text}
                            </p>
                          </div>
                        ),
                    )}
                    {activeTab === 'pending' && (
                      <button
                        onClick={() => handleOpenDraft(draft, false)}
                        className="mt-1 w-full rounded bg-green-600 py-1 text-xs font-medium text-white hover:bg-green-700"
                      >
                        Review & Approve
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
