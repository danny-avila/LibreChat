import { useState } from 'react';
import { ORGANIZATION_ONBOARDING_REQUIRED_CODE } from 'librechat-data-provider';
import {
  Label,
  Button,
  OGDialog,
  OGDialogTrigger,
  useToastContext,
  OGDialogTemplate,
} from '@librechat/client';
import {
  loadAppPath,
  enterOrganizationSession,
  startOrganizationOnboarding,
  clearOrganizationScopedStorage,
} from '~/utils';
import { useCurrentOrganizationQuery, useLeaveOrganizationMutation } from '~/data-provider';
import { useLocalize, useOrganizationErrorMessage } from '~/hooks';

/**
 * Leaves the current organization. Its data stays with the organization; the session moves to
 * the account's next organization, or to onboarding when it has none left.
 */
export default function LeaveOrganization() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const getOrganizationError = useOrganizationErrorMessage();
  const { data } = useCurrentOrganizationQuery();
  const [open, setOpen] = useState(false);
  const leave = useLeaveOrganizationMutation({
    onSuccess: (result) => {
      if (result.organization) {
        enterOrganizationSession(result.organization.id);
        return;
      }
      clearOrganizationScopedStorage();
      if (
        !startOrganizationOnboarding({
          code: ORGANIZATION_ONBOARDING_REQUIRED_CODE,
          onboardingToken: result.onboardingToken,
        })
      ) {
        loadAppPath('/login');
      }
    },
    onError: (error) => {
      setOpen(false);
      showToast({ message: getOrganizationError(error), status: 'error' });
    },
  });

  return (
    <OGDialog open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-3">
        <Label className="font-light">{localize('com_ui_org_leave')}</Label>
        <OGDialogTrigger asChild>
          <Button variant="destructive" aria-label={localize('com_ui_org_leave')}>
            {localize('com_ui_org_leave')}
          </Button>
        </OGDialogTrigger>
      </div>
      <OGDialogTemplate
        title={localize('com_ui_org_leave')}
        description={localize('com_ui_org_leave_confirm', { 0: data?.organization.name ?? '' })}
        className="w-11/12 max-w-md"
        selection={{
          selectHandler: () => leave.mutate(),
          selectClasses:
            'bg-surface-destructive hover:bg-surface-destructive-hover text-text-on-status',
          selectText: localize('com_ui_org_leave'),
          isLoading: leave.isLoading,
        }}
      />
    </OGDialog>
  );
}
