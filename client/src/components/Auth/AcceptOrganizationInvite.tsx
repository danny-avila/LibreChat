import { useEffect, useRef } from 'react';
import { Spinner } from '@librechat/client';
import { Link, useParams } from 'react-router-dom';
import { useAuthContext, useLocalize, useOrganizationErrorMessage } from '~/hooks';
import { clearPendingInviteToken, enterOrganizationSession } from '~/utils';
import { useAcceptOrganizationInviteMutation } from '~/data-provider';

/** A signed-in person accepting an invite link: joins, then opens that organization. */
export default function AcceptOrganizationInvite() {
  const localize = useLocalize();
  const { token = '' } = useParams();
  const { isAuthenticated } = useAuthContext();
  const getOrganizationError = useOrganizationErrorMessage();
  const attempted = useRef(false);
  const accept = useAcceptOrganizationInviteMutation(undefined, {
    onSuccess: (session) => enterOrganizationSession(session.organization.id),
    onError: () => clearPendingInviteToken(),
  });

  useEffect(() => {
    if (isAuthenticated && token && !attempted.current) {
      attempted.current = true;
      accept.mutate(token);
    }
  }, [isAuthenticated, token, accept]);

  return (
    <main className="bg-surface-primary flex min-h-screen items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center" aria-live="polite">
        {accept.error != null ? (
          <>
            <p className="text-text-primary text-sm" role="alert">
              {getOrganizationError(accept.error)}
            </p>
            <Link
              to="/c/new"
              className="text-accent-primary hover:text-accent-primary-hover text-sm font-medium"
            >
              {localize('com_auth_continue')}
            </Link>
          </>
        ) : (
          <>
            <Spinner />
            <p className="text-text-secondary text-sm">{localize('com_auth_invite_accepting')}</p>
          </>
        )}
      </div>
    </main>
  );
}
