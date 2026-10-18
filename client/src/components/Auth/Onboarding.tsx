import { useEffect, useState } from 'react';
import { loginPage } from 'librechat-data-provider';
import { useOutletContext } from 'react-router-dom';
import { Button, Input, Spinner, floatingLabel } from '@librechat/client';
import type { TOrganizationSessionResponse } from 'librechat-data-provider';
import type { TLoginLayoutContext } from '~/common';
import {
  useCreateOrganizationMutation,
  usePendingOrganizationInvitesQuery,
  useOrganizationInvitePreviewQuery,
  useAcceptOrganizationInviteMutation,
  useAcceptPendingOrganizationInviteMutation,
} from '~/data-provider';
import {
  getOnboardingToken,
  getPendingInviteToken,
  clearOnboardingToken,
  enterOrganizationSession,
  isOnboardingEmailUnverified,
} from '~/utils';
import { useLocalize, useOrganizationErrorMessage } from '~/hooks';
import { ErrorMessage } from './ErrorMessage';

const isUnauthorized = (error: unknown) =>
  (error as { response?: { status?: number } } | null)?.response?.status === 401;

/** Where an account that belongs to no organization yet lands after signing in. */
export default function Onboarding() {
  const localize = useLocalize();
  const getOrganizationError = useOrganizationErrorMessage();
  const { setHeaderText } = useOutletContext<TLoginLayoutContext>();
  const [onboardingToken] = useState(getOnboardingToken);
  const [pendingInviteToken] = useState(getPendingInviteToken);
  const [emailUnverified] = useState(isOnboardingEmailUnverified);
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [expired, setExpired] = useState(!onboardingToken);

  useEffect(() => {
    setHeaderText('com_auth_onboarding_title');
  }, [setHeaderText]);

  const options = {
    onSuccess: (session: TOrganizationSessionResponse) =>
      enterOrganizationSession(session.organization.id),
    onError: (mutationError: unknown) => {
      if (isUnauthorized(mutationError)) {
        clearOnboardingToken();
        setExpired(true);
        return;
      }
      setError(getOrganizationError(mutationError));
    },
  };
  const createOrganization = useCreateOrganizationMutation(onboardingToken, options);
  const acceptLink = useAcceptOrganizationInviteMutation(onboardingToken, options);
  const acceptPending = useAcceptPendingOrganizationInviteMutation(onboardingToken, options);
  const { data: invitePreview } = useOrganizationInvitePreviewQuery(pendingInviteToken ?? '', {
    enabled: !expired && !!pendingInviteToken,
  });
  const { data: pending } = usePendingOrganizationInvitesQuery(onboardingToken, {
    enabled: !expired && !!onboardingToken,
  });

  const busy = createOrganization.isLoading || acceptLink.isLoading || acceptPending.isLoading;
  const trimmed = name.trim();
  const nameValid = trimmed.length >= 2 && trimmed.length <= 80;

  if (expired) {
    return (
      <div className="mt-6 text-center">
        <p className="text-text-secondary text-sm">{localize('com_auth_onboarding_expired')}</p>
        <a
          href={loginPage()}
          className="text-accent-primary hover:text-accent-primary-hover mt-4 inline-flex p-1 text-sm font-medium"
        >
          {localize('com_auth_back_to_login')}
        </a>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <p className="text-text-secondary text-center text-sm">
        {localize('com_auth_onboarding_description')}
      </p>
      {error && <ErrorMessage>{error}</ErrorMessage>}

      {(invitePreview || (pending?.invites.length ?? 0) > 0) && (
        <section aria-labelledby="onboarding-invites" className="flex flex-col gap-2">
          <h2 id="onboarding-invites" className="text-text-primary text-sm font-medium">
            {localize('com_auth_onboarding_invites')}
          </h2>
          <ul className="flex flex-col gap-2">
            {invitePreview && pendingInviteToken && (
              <li className="border-border-medium flex items-center justify-between gap-3 rounded-lg border p-3">
                <span className="text-text-primary truncate text-sm">
                  {invitePreview.organization.name}
                </span>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => acceptLink.mutate(pendingInviteToken)}
                >
                  {localize('com_auth_onboarding_join')}
                </Button>
              </li>
            )}
            {pending?.invites.map((invite) => (
              <li
                key={invite.id}
                className="border-border-medium flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <span className="text-text-primary truncate text-sm">
                  {invite.organization.name}
                </span>
                <Button size="sm" disabled={busy} onClick={() => acceptPending.mutate(invite.id)}>
                  {localize('com_auth_onboarding_join')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {emailUnverified ? (
        /* Creating an organization needs a verified address; joining by an email invite,
         * which proves the mailbox, still works above. */
        <p role="status" className="text-text-secondary text-center text-sm">
          {localize('com_auth_onboarding_verify_email')}
        </p>
      ) : (
        <form
          aria-labelledby="onboarding-create"
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (nameValid) {
              setError(undefined);
              createOrganization.mutate({ name: trimmed });
            }
          }}
        >
          <h2 id="onboarding-create" className="text-text-primary text-sm font-medium">
            {localize('com_auth_onboarding_create')}
          </h2>
          <p className="text-text-secondary text-xs">
            {localize('com_auth_onboarding_create_description')}
          </p>
          <div className="relative">
            <Input
              id="organization-name"
              value={name}
              maxLength={80}
              autoComplete="organization"
              onChange={(event) => setName(event.target.value)}
              variant="floating"
              placeholder=" "
              data-testid="organization-name"
            />
            <label htmlFor="organization-name" className={floatingLabel}>
              {localize('com_auth_org_name')}
            </label>
          </div>
          <Button
            type="submit"
            variant="submit"
            shape="soft"
            size="auth"
            className="w-full"
            disabled={!nameValid || busy}
          >
            {createOrganization.isLoading ? <Spinner /> : localize('com_auth_onboarding_create')}
          </Button>
        </form>
      )}
    </div>
  );
}
