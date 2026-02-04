import { useState, useEffect, useCallback, memo } from 'react';
import { useSetRecoilState } from 'recoil';
import { socialDraftState } from '~/store/socialDraft';
import { useLocalize, useAuthContext } from '~/hooks';
import { getDraftPreview, type SocialDraftRecord } from '~/components/SocialDraft/SocialDraftModal';
import { Eye } from 'lucide-react';

const SocialDraftsNav = memo(() => {
  const [pendingDrafts, setPendingDrafts] = useState<SocialDraftRecord[]>([]);
  const [approvedDrafts, setApprovedDrafts] = useState<SocialDraftRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const { token, isAuthenticated } = useAuthContext();
  const localize = useLocalize();
  const setSocialDraftState = useSetRecoilState(socialDraftState);

  const showSocialDraft = import.meta.env.VITE_SOCIAL_MEDIA_AUTOMATION === 'true';
  if (!showSocialDraft) return null;

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
      setPendingDrafts(pendingData.success ? pendingData.drafts.slice(0, 10) : []);
      setApprovedDrafts(approvedData.success ? approvedData.drafts.slice(0, 10) : []);
    } catch {
      setPendingDrafts([]);
      setApprovedDrafts([]);
    } finally {
      setLoading(false);
    }
  }, [token, isAuthenticated]);

  useEffect(() => {
    fetchDrafts();
    const interval = setInterval(fetchDrafts, 30000);
    return () => clearInterval(interval);
  }, [fetchDrafts]);

  const openDraft = useCallback(
    (draft: SocialDraftRecord) => {
      setSocialDraftState({ isOpen: true });
    },
    [setSocialDraftState],
  );

  if (!isAuthenticated || (pendingDrafts.length === 0 && approvedDrafts.length === 0)) {
    return null;
  }

  return (
    <div className="mb-4 border-b border-border-light pb-4 dark:border-border-medium">
      {pendingDrafts.length > 0 && (
        <div className="mb-3">
          <h3 className="mb-1.5 px-2 text-xs font-semibold text-text-secondary">
            {localize('com_nav_previous_social_drafts')}
          </h3>
          <div className="space-y-1">
            {pendingDrafts.map((draft) => (
              <button
                key={draft._id}
                onClick={() => openDraft(draft)}
                className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
                title={getDraftPreview(draft.drafts)}
              >
                <Eye className="h-3.5 w-3.5 flex-shrink-0 text-text-secondary group-hover:text-text-primary" />
                <span className="truncate text-xs">{getDraftPreview(draft.drafts, 8)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {approvedDrafts.length > 0 && (
        <div>
          <h3 className="mb-1.5 px-2 text-xs font-semibold text-text-secondary">
            {localize('com_nav_approved_social_drafts')}
          </h3>
          <div className="space-y-1">
            {approvedDrafts.map((draft) => (
              <button
                key={draft._id}
                onClick={() => openDraft(draft)}
                className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
                title={getDraftPreview(draft.drafts)}
              >
                <Eye className="h-3.5 w-3.5 flex-shrink-0 text-text-secondary group-hover:text-text-primary" />
                <span className="truncate text-xs">{getDraftPreview(draft.drafts, 8)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

SocialDraftsNav.displayName = 'SocialDraftsNav';

export default SocialDraftsNav;
