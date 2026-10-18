import { useEffect, useState } from 'react';
import { SystemRoles, OrganizationMemberStatus } from 'librechat-data-provider';
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
import type { TOrganizationMember } from 'librechat-data-provider';
import {
  useUpdateOrganizationMemberMutation,
  useOrganizationMembersInfiniteQuery,
  useDeactivateOrganizationMemberMutation,
} from '~/data-provider';
import { useAuthContext, useLocalize, useOrganizationErrorMessage } from '~/hooks';

const SEARCH_DELAY_MS = 250;

function MemberRow({ member, isSelf }: { member: TOrganizationMember; isSelf: boolean }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const getOrganizationError = useOrganizationErrorMessage();
  const [confirming, setConfirming] = useState(false);
  const onError = (error: unknown) =>
    showToast({ message: getOrganizationError(error), status: 'error' });
  const updateRole = useUpdateOrganizationMemberMutation({
    onSuccess: () => showToast({ message: localize('com_ui_org_role_updated'), status: 'success' }),
    onError,
  });
  const deactivate = useDeactivateOrganizationMemberMutation({
    onSuccess: () => {
      setConfirming(false);
      showToast({ message: localize('com_ui_org_member_removed'), status: 'success' });
    },
    onError,
  });

  const displayName = member.name || member.username || member.email;
  const removed = member.status === OrganizationMemberStatus.DEACTIVATED;
  const roleOptions = [
    { value: SystemRoles.USER, label: localize('com_ui_user') },
    { value: SystemRoles.ADMIN, label: localize('com_ui_admin') },
    ...(member.role !== SystemRoles.USER && member.role !== SystemRoles.ADMIN
      ? [{ value: member.role, label: member.role }]
      : []),
  ];

  return (
    <li className="border-border-light flex flex-wrap items-center gap-3 border-b py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-text-primary truncate text-sm">
          {displayName}{' '}
          {isSelf && (
            <span className="text-text-secondary">{localize('com_ui_org_member_you')}</span>
          )}
        </span>
        <span className="text-text-secondary truncate text-xs">{member.email}</span>
      </div>
      {removed ? (
        <span className="text-text-secondary text-xs">
          {localize('com_ui_org_member_deactivated')}
        </span>
      ) : (
        <>
          <Dropdown
            value={member.role}
            options={roleOptions}
            ariaLabel={localize('com_ui_org_member_role_label', { 0: displayName })}
            disabled={updateRole.isLoading}
            onChange={(role) => {
              if (role !== member.role) {
                updateRole.mutate({ memberId: member.id, role });
              }
            }}
          />
          {!isSelf &&
            (confirming ? (
              <Button
                size="sm"
                variant="destructive"
                disabled={deactivate.isLoading}
                aria-label={localize('com_ui_org_member_remove_confirm', { 0: displayName })}
                title={localize('com_ui_org_member_remove_confirm', { 0: displayName })}
                onClick={() => deactivate.mutate(member.id)}
              >
                {deactivate.isLoading ? <Spinner /> : localize('com_ui_confirm')}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
                {localize('com_ui_org_member_remove')}
              </Button>
            ))}
        </>
      )}
    </li>
  );
}

/** Admins manage the organization's members: roles and removal. */
export default function OrganizationMembers() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useOrganizationMembersInfiniteQuery(query ? { search: query } : {}, { enabled: open });
  const members = data?.pages.flatMap((page) => page.members) ?? [];
  const renderMembers = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col gap-2 py-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      );
    }
    if (members.length === 0) {
      return (
        <p className="text-text-secondary py-6 text-center text-sm">
          {localize('com_ui_org_members_empty')}
        </p>
      );
    }
    return (
      <ul>
        {members.map((member) => (
          <MemberRow key={member.id} member={member} isSelf={member.id === user?.id} />
        ))}
      </ul>
    );
  };

  return (
    <OGDialog open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between">
        <Label className="font-light">{localize('com_ui_org_members')}</Label>
        <OGDialogTrigger asChild>
          <Button variant="outline" aria-label={localize('com_ui_org_members')}>
            {localize('com_ui_manage')}
          </Button>
        </OGDialogTrigger>
      </div>
      <OGDialogContent className="w-11/12 max-w-2xl" showCloseButton={true}>
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_ui_org_members')}</OGDialogTitle>
        </OGDialogHeader>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={localize('com_ui_org_members_search')}
          aria-label={localize('com_ui_org_members_search')}
        />
        <div className="max-h-[60vh] overflow-y-auto" aria-busy={isFetching}>
          {renderMembers()}
        </div>
        {hasNextPage === true && (
          <Button
            variant="outline"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? <Spinner /> : localize('com_ui_load_more')}
          </Button>
        )}
      </OGDialogContent>
    </OGDialog>
  );
}
