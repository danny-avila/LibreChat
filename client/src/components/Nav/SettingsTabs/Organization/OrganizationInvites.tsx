import { useState } from 'react';
import { Copy } from 'lucide-react';
import { SystemRoles, OrganizationInviteKind } from 'librechat-data-provider';
import {
  Input,
  Label,
  Button,
  Spinner,
  OGDialog,
  Dropdown,
  Skeleton,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogTrigger,
  OGDialogContent,
  useToastContext,
} from '@librechat/client';
import type {
  TOrganizationInvite,
  TCreateOrganizationInviteResponse,
} from 'librechat-data-provider';
import {
  useOrganizationInvitesQuery,
  useResendOrganizationInviteMutation,
  useRevokeOrganizationInviteMutation,
  useCreateOrganizationInviteMutation,
} from '~/data-provider';
import { useLocalize, useOrganizationErrorMessage } from '~/hooks';
import { useSettingsContext } from '../../Settings/context';
import { useGetStartupConfig } from '~/data-provider';

const DEFAULT_LINK_USES = 25;

function InviteRow({
  invite,
  onIssued,
}: {
  invite: TOrganizationInvite;
  onIssued: (issued: TCreateOrganizationInviteResponse) => void;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const getOrganizationError = useOrganizationErrorMessage();
  const onError = (error: unknown) =>
    showToast({ message: getOrganizationError(error), status: 'error' });
  const revoke = useRevokeOrganizationInviteMutation({
    onSuccess: () =>
      showToast({ message: localize('com_ui_org_invite_revoked'), status: 'success' }),
    onError,
  });
  const resend = useResendOrganizationInviteMutation({ onSuccess: onIssued, onError });
  const expires = new Date(invite.expiresAt).toLocaleDateString();

  return (
    <li className="border-border-light flex flex-wrap items-center gap-3 border-b py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-text-primary truncate text-sm">
          {invite.kind === OrganizationInviteKind.EMAIL
            ? invite.email
            : localize('com_ui_org_invite_kind_link')}
        </span>
        <span className="text-text-secondary text-xs">
          {invite.role} · {localize('com_ui_org_invite_expires', { 0: expires })}
          {invite.kind === OrganizationInviteKind.LINK &&
            ` · ${localize('com_ui_org_invite_uses', { 0: String(invite.useCount), 1: String(invite.maxUses) })}`}
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={resend.isLoading}
        onClick={() => resend.mutate(invite.id)}
      >
        {resend.isLoading ? <Spinner /> : localize('com_ui_org_invite_resend')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={revoke.isLoading}
        onClick={() => revoke.mutate(invite.id)}
      >
        {localize('com_ui_org_invite_revoke')}
      </Button>
    </li>
  );
}

/** Admins invite people by email or with a shareable link, and manage pending invitations. */
export default function OrganizationInvites() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { isOrganizationAdmin } = useSettingsContext();
  const { data: startupConfig } = useGetStartupConfig();
  const getOrganizationError = useOrganizationErrorMessage();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>(SystemRoles.USER);
  const [maxUses, setMaxUses] = useState(String(DEFAULT_LINK_USES));
  const [issued, setIssued] = useState<TCreateOrganizationInviteResponse>();
  const { data, isLoading } = useOrganizationInvitesQuery({ enabled: open });
  const allowLinkInvites = startupConfig?.organizations?.allowLinkInvites !== false;

  const announce = (result: TCreateOrganizationInviteResponse) => {
    setIssued(result);
    if (result.invite.kind === OrganizationInviteKind.EMAIL) {
      showToast({
        message: result.emailSent
          ? localize('com_ui_org_invite_sent', { 0: result.invite.email ?? '' })
          : localize('com_ui_org_invite_not_sent'),
        status: result.emailSent ? 'success' : 'warning',
      });
    }
  };
  const create = useCreateOrganizationInviteMutation({
    onSuccess: (result) => {
      announce(result);
      setEmail('');
    },
    onError: (error) => showToast({ message: getOrganizationError(error), status: 'error' }),
  });

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showToast({ message: localize('com_ui_org_invite_copied'), status: 'success' });
    } catch {
      showToast({ message: localize('com_ui_error'), status: 'error' });
    }
  };

  const roleOptions = [
    { value: SystemRoles.USER, label: localize('com_ui_user') },
    ...(isOrganizationAdmin ? [{ value: SystemRoles.ADMIN, label: localize('com_ui_admin') }] : []),
  ];
  const usesNumber = Number(maxUses);
  const invites = data?.invites ?? [];
  const renderPending = () => {
    if (isLoading) {
      return <Skeleton className="h-10 w-full" />;
    }
    if (invites.length === 0) {
      return (
        <p className="text-text-secondary py-4 text-center text-sm">
          {localize('com_ui_org_invites_empty')}
        </p>
      );
    }
    return (
      <ul>
        {invites.map((invite) => (
          <InviteRow key={invite.id} invite={invite} onIssued={announce} />
        ))}
      </ul>
    );
  };

  return (
    <OGDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setIssued(undefined);
        }
      }}
    >
      <div className="flex items-center justify-between">
        <Label className="font-light">{localize('com_ui_settings_section_org_invites')}</Label>
        <OGDialogTrigger asChild>
          <Button variant="outline" aria-label={localize('com_ui_settings_section_org_invites')}>
            {localize('com_ui_manage')}
          </Button>
        </OGDialogTrigger>
      </div>
      <OGDialogContent className="w-11/12 max-w-2xl" showCloseButton={true}>
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_ui_settings_section_org_invites')}</OGDialogTitle>
        </OGDialogHeader>

        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({ kind: OrganizationInviteKind.EMAIL, email: email.trim(), role });
          }}
        >
          <Label htmlFor="organization-invite-email">{localize('com_ui_org_invite_email')}</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="organization-invite-email"
              type="email"
              required
              value={email}
              className="min-w-0 flex-1"
              placeholder={localize('com_ui_org_invite_email_placeholder')}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Dropdown
              value={role}
              options={roleOptions}
              onChange={setRole}
              ariaLabel={localize('com_ui_role')}
            />
            <Button type="submit" disabled={!email.trim() || create.isLoading}>
              {create.isLoading ? <Spinner /> : localize('com_ui_org_invite_send')}
            </Button>
          </div>
        </form>

        {allowLinkInvites && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="organization-invite-uses">{localize('com_ui_org_invite_link')}</Label>
            <p className="text-text-secondary text-xs">
              {localize('com_ui_org_invite_link_description')}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="organization-invite-uses"
                type="number"
                min={1}
                max={10000}
                value={maxUses}
                className="w-28"
                aria-label={localize('com_ui_org_invite_max_uses')}
                onChange={(event) => setMaxUses(event.target.value)}
              />
              <Button
                variant="outline"
                disabled={!(usesNumber >= 1) || create.isLoading}
                onClick={() =>
                  create.mutate({ kind: OrganizationInviteKind.LINK, role, maxUses: usesNumber })
                }
              >
                {localize('com_ui_org_invite_link_create')}
              </Button>
            </div>
          </div>
        )}

        {issued && (
          <div className="border-border-medium flex items-center gap-2 rounded-lg border p-2">
            <code
              className="text-text-primary min-w-0 flex-1 truncate text-xs"
              data-testid="invite-url"
            >
              {issued.url}
            </code>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={localize('com_ui_copy_link')}
              onClick={() => void copy(issued.url)}
            >
              <Copy className="icon-sm" aria-hidden="true" />
            </Button>
          </div>
        )}

        <section aria-labelledby="organization-pending-invites" className="flex flex-col gap-1">
          <h3 id="organization-pending-invites" className="text-text-primary text-sm font-medium">
            {localize('com_ui_org_invites_pending')}
          </h3>
          <div className="max-h-[40vh] overflow-y-auto">{renderPending()}</div>
        </section>
      </OGDialogContent>
    </OGDialog>
  );
}
