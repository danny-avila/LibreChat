import { useEffect, useState } from 'react';
import { Button, Spinner } from '@librechat/client';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { TLoginLayoutContext } from '~/common';
import {
  useOrganizationInvitePreviewQuery,
  useAcceptOrganizationInviteMutation,
} from '~/data-provider';
import { getOnboardingToken, persistPendingInviteToken, enterOrganizationSession } from '~/utils';
import { useLocalize, useOrganizationErrorMessage } from '~/hooks';
import { ErrorMessage } from './ErrorMessage';

/**
 * What an invite link opens before (or without) a session: the organization and who invited
 * you, then sign in or create an account to accept. An account still onboarding accepts here.
 */
export default function OrganizationInvite() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { token = '' } = useParams();
  const getOrganizationError = useOrganizationErrorMessage();
  const { setHeaderText } = useOutletContext<TLoginLayoutContext>();
  const [onboardingToken] = useState(getOnboardingToken);
  const { data: preview, error, isLoading } = useOrganizationInvitePreviewQuery(token);
  const accept = useAcceptOrganizationInviteMutation(onboardingToken, {
    onSuccess: (session) => enterOrganizationSession(session.organization.id),
  });

  useEffect(() => {
    setHeaderText('com_auth_invite_title');
  }, [setHeaderText]);

  if (isLoading) {
    return (
      <div className="mt-6 flex justify-center" aria-busy="true">
        <Spinner />
      </div>
    );
  }
  if (error || !preview) {
    return <ErrorMessage>{getOrganizationError(error)}</ErrorMessage>;
  }

  const organization = preview.organization.name;
  const signInToAccept = () => {
    persistPendingInviteToken(token);
    const acceptPath = `/invite/${encodeURIComponent(token)}/accept`;
    navigate(`/login?redirect_to=${encodeURIComponent(acceptPath)}`);
  };

  return (
    <div className="mt-6 flex flex-col gap-4 text-center">
      <p className="text-text-primary text-sm">
        {preview.inviterName
          ? localize('com_auth_invite_description', { inviter: preview.inviterName, organization })
          : localize('com_auth_invite_description_anonymous', { organization })}
      </p>
      {preview.email && (
        <p className="text-text-secondary text-xs">
          {localize('com_auth_invite_email_bound', { 0: preview.email })}
        </p>
      )}
      {accept.error != null && <ErrorMessage>{getOrganizationError(accept.error)}</ErrorMessage>}
      {onboardingToken ? (
        <Button
          variant="submit"
          shape="soft"
          size="auth"
          className="w-full"
          disabled={accept.isLoading}
          onClick={() => accept.mutate(token)}
        >
          {accept.isLoading ? <Spinner /> : localize('com_auth_invite_accept')}
        </Button>
      ) : (
        <>
          <Button
            variant="submit"
            shape="soft"
            size="auth"
            className="w-full"
            onClick={signInToAccept}
          >
            {localize('com_auth_invite_sign_in')}
          </Button>
          <Button
            variant="outline"
            shape="soft"
            size="auth"
            className="w-full"
            onClick={() => navigate(`/register?invite=${encodeURIComponent(token)}`)}
          >
            {localize('com_auth_invite_create_account')}
          </Button>
        </>
      )}
    </div>
  );
}
