/* eslint-disable i18next/no-literal-string */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, ExternalLink } from 'lucide-react';
import {
  Button,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToastContext,
  NotificationSeverity,
} from '@librechat/client';
import type { AdminUserListItem } from 'librechat-data-provider';
import { useAdminUser, useAdminAuditLog } from '~/data-provider/Admin';
import { useRefreshSubscriptionMutation } from '~/data-provider/Admin';
import {
  BanUserDialog,
  UnbanUserDialog,
  ChangeRoleDialog,
  ResetPasswordDialog,
  DeleteUserDialog,
  AdjustBalanceDialog,
  SetBalanceDialog,
  GrantProDialog,
  RevokeProDialog,
  ClearOverrideDialog,
} from '~/components/Admin/Users';
import { friendlyUserError } from '~/components/Admin/Users/dialogUtils';

// Only render avatar URLs that are same-origin or relative. Anything else
// would cause the browser to fetch the image at admin-page-load, leaking the
// admin's IP / User-Agent / Referer to whatever host the user controls.
function isSafeAvatarSrc(src: string): boolean {
  if (!src) return false;
  if (src.startsWith('/') && !src.startsWith('//')) return true; // relative
  if (src.startsWith('data:image/')) return true;
  try {
    const u = new URL(src, window.location.origin);
    return u.origin === window.location.origin;
  } catch {
    return false;
  }
}

function fmtDate(value: unknown): string {
  if (!value) return '—';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDateOnly(value: unknown): string {
  if (!value) return '—';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function RoleBadge({ role }: { role?: string | null }) {
  const isAdmin = role === 'ADMIN';
  return (
    <span
      className={
        isAdmin
          ? 'inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-200'
          : 'inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300'
      }
    >
      {role ?? 'USER'}
    </span>
  );
}

function BannedBadge({ banned }: { banned?: boolean }) {
  return banned ? (
    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-200">
      Banned
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
      Active
    </span>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (status === 'failure')
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-200">
        failure
      </span>
    );
  return (
    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
      success
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-text-primary">{value || '—'}</span>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

type ActionKind =
  | 'ban'
  | 'unban'
  | 'role'
  | 'reset'
  | 'delete'
  | 'grantPro'
  | 'revokePro'
  | 'clearOverride'
  | 'adjustBalance'
  | 'setBalance';

export default function UserDetailPage() {
  const params = useParams();
  const userId = params.userId ?? '';
  const detailQuery = useAdminUser(userId);
  const { showToast } = useToastContext();
  const refreshSub = useRefreshSubscriptionMutation();

  const auditQuery = useAdminAuditLog(
    {
      targetType: 'user',
      targetId: userId,
      limit: 25,
      sort: '-createdAt',
    },
    { enabled: !!userId },
  );

  const [activeAction, setActiveAction] = useState<ActionKind | null>(null);

  const closeAction = () => setActiveAction(null);

  if (detailQuery.isLoading) {
    return (
      <div className="p-6">
        <ProfileSkeleton />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="p-6">
        <div
          role="alert"
          className="flex items-center justify-between rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          <span>Failed to load user.</span>
          <Button size="sm" variant="outline" onClick={() => detailQuery.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const { user, subscription, balance } = detailQuery.data;
  const userItem: AdminUserListItem = user;

  const onRefreshSubscription = async () => {
    try {
      await refreshSub.mutateAsync({ userId });
      showToast({
        message: 'Refreshed from RevenueCat',
        severity: NotificationSeverity.SUCCESS,
      });
    } catch (err) {
      showToast({
        message: friendlyUserError(err),
        severity: NotificationSeverity.ERROR,
      });
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link
          to="/admin/users"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to users
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-lg font-semibold uppercase text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {/* Don't render avatar URLs from arbitrary remote hosts in the
                  admin UI — fetching the image would leak the admin's IP /
                  User-Agent / Referer to whatever host the user set. Only
                  same-origin or relative paths are loaded inline. */}
              {user.avatar && isSafeAvatarSrc(user.avatar) ? (
                <img
                  src={user.avatar}
                  alt={user.name ?? user.email ?? ''}
                  className="h-full w-full object-cover"
                />
              ) : (
                (user.name ?? user.email ?? '?').slice(0, 1)
              )}
            </div>
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-semibold text-text-primary">
                {user.name || user.username || user.email}
              </h1>
              <div className="text-sm text-muted-foreground">{user.email}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <RoleBadge role={user.role} />
                <BannedBadge banned={user.banned} />
                <span className="text-xs text-muted-foreground">
                  Created {fmtDateOnly(user.createdAt)}
                </span>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => detailQuery.refetch()}
            disabled={detailQuery.isFetching}
          >
            <RefreshCw className={'h-4 w-4 ' + (detailQuery.isFetching ? 'animate-spin' : '')} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="balance">Balance</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="conversations">Conversations</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        {/* Profile */}
        <TabsContent
          value="profile"
          className="rounded-lg border border-border-light bg-white p-6 dark:bg-gray-900"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" value={user.name ?? '—'} />
            <Field label="Email" value={user.email} />
            <Field label="Username" value={user.username ?? '—'} />
            <Field label="Provider" value={user.provider ?? 'local'} />
            <Field label="Email verified" value={user.emailVerified ? 'Yes' : 'No'} />
            <Field label="Two-factor" value={user.twoFactorEnabled ? 'Enabled' : 'Disabled'} />
            <Field label="Role" value={<RoleBadge role={user.role} />} />
            <Field label="Status" value={<BannedBadge banned={user.banned} />} />
            <Field label="Created" value={fmtDate(user.createdAt)} />
            <Field label="Updated" value={fmtDate(user.updatedAt)} />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border-light pt-4">
            {user.banned ? (
              <Button onClick={() => setActiveAction('unban')}>Unban</Button>
            ) : (
              <Button variant="destructive" onClick={() => setActiveAction('ban')}>
                Ban
              </Button>
            )}
            <Button variant="outline" onClick={() => setActiveAction('role')}>
              Change role
            </Button>
            <Button variant="outline" onClick={() => setActiveAction('reset')}>
              Reset password
            </Button>
            <Button variant="destructive" onClick={() => setActiveAction('delete')}>
              Delete user
            </Button>
          </div>
        </TabsContent>

        {/* Subscription */}
        <TabsContent
          value="subscription"
          className="rounded-lg border border-border-light bg-white p-6 dark:bg-gray-900"
        >
          {subscription ? (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Pro"
                  value={
                    subscription.isPro ? (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                        Pro
                      </span>
                    ) : (
                      'No'
                    )
                  }
                />
                <Field label="Plan" value={subscription.currentPlan ?? '—'} />
                <Field label="Product ID" value={subscription.productId ?? '—'} />
                <Field label="Store" value={subscription.store ?? '—'} />
                <Field label="Expires" value={fmtDate(subscription.expiresAt)} />
                <Field label="Last synced" value={fmtDate(subscription.lastSyncedAt)} />
              </div>
              {subscription.manualOverride ? (
                <div className="rounded-md border border-border-light bg-surface-secondary p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Manual override
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Field
                      label="Enabled"
                      value={subscription.manualOverride.enabled ? 'Yes' : 'No'}
                    />
                    <Field label="Mode" value={subscription.manualOverride.mode ?? '—'} />
                    <Field label="Source" value={subscription.manualOverride.source ?? '—'} />
                    <Field label="Updated" value={fmtDate(subscription.manualOverride.updatedAt)} />
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 border-t border-border-light pt-4">
                <Button onClick={() => setActiveAction('grantPro')}>Grant Pro</Button>
                <Button variant="destructive" onClick={() => setActiveAction('revokePro')}>
                  Revoke Pro
                </Button>
                <Button variant="outline" onClick={() => setActiveAction('clearOverride')}>
                  Clear override
                </Button>
                <Button
                  variant="outline"
                  onClick={onRefreshSubscription}
                  disabled={refreshSub.isLoading}
                >
                  <RefreshCw
                    className={'h-4 w-4 ' + (refreshSub.isLoading ? 'animate-spin' : '')}
                  />
                  Refresh from RevenueCat
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">No subscription on file.</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => setActiveAction('grantPro')}>Grant Pro</Button>
                <Button variant="outline" onClick={onRefreshSubscription}>
                  Refresh from RevenueCat
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Balance */}
        <TabsContent
          value="balance"
          className="rounded-lg border border-border-light bg-white p-6 dark:bg-gray-900"
        >
          {balance ? (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Token credits"
                  value={
                    <span className="text-base font-semibold">
                      {balance.tokenCredits.toLocaleString()}
                    </span>
                  }
                />
                <Field
                  label="Auto-refill"
                  value={
                    balance.autoRefill?.enabled
                      ? `Enabled (every ${balance.autoRefill.intervalValue} ${balance.autoRefill.intervalUnit}, ${balance.autoRefill.amount.toLocaleString()} tokens)`
                      : 'Disabled'
                  }
                />
                <Field label="Last refill" value={fmtDate(balance.autoRefill?.lastRefill)} />
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-border-light pt-4">
                <Button onClick={() => setActiveAction('adjustBalance')}>Adjust balance</Button>
                <Button variant="outline" onClick={() => setActiveAction('setBalance')}>
                  Set balance
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">No balance record yet.</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => setActiveAction('setBalance')}>Set balance</Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Usage */}
        <TabsContent
          value="usage"
          className="rounded-lg border border-border-light bg-white p-6 dark:bg-gray-900"
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Detailed token usage for this user, including by-day timeseries and per-model
              breakdowns.
            </p>
            <Link
              to={`/admin/usage/users/${userId}`}
              className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Open usage report
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <div data-stub="usage" className="hidden" />
        </TabsContent>

        {/* Conversations */}
        <TabsContent
          value="conversations"
          className="rounded-lg border border-border-light bg-white p-6 dark:bg-gray-900"
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Browse this user&apos;s conversations and messages.
            </p>
            <Link
              to={`/admin/messages/users/${userId}`}
              className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Open conversations
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <div data-stub="conversations" className="hidden" />
        </TabsContent>

        {/* Audit */}
        <TabsContent
          value="audit"
          className="rounded-lg border border-border-light bg-white p-2 dark:bg-gray-900"
        >
          <div className="flex items-center justify-between p-3">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Recent audit events</h3>
              <p className="text-xs text-muted-foreground">Last 25 events targeting this user.</p>
            </div>
            <Link
              to={`/admin/audit?targetType=user&targetId=${userId}`}
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          {auditQuery.isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 4 }).map((_, idx) => (
                <Skeleton key={idx} className="h-8 w-full" />
              ))}
            </div>
          ) : auditQuery.isError ? (
            <div
              role="alert"
              className="m-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
            >
              Failed to load audit log.
            </div>
          ) : (auditQuery.data?.items.length ?? 0) === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No audit events for this user yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(auditQuery.data?.items ?? []).map((entry) => (
                  <TableRow key={entry._id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {fmtDate(entry.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                    <TableCell>
                      <StatusBadge status={entry.status} />
                    </TableCell>
                    <TableCell className="text-xs">{entry.actorEmail ?? '—'}</TableCell>
                    <TableCell
                      className="max-w-xs truncate text-xs text-muted-foreground"
                      title={entry.reason ?? ''}
                    >
                      {entry.reason ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      {/* Modals */}
      {activeAction === 'ban' ? (
        <BanUserDialog user={userItem} open onOpenChange={(o) => !o && closeAction()} />
      ) : null}
      {activeAction === 'unban' ? (
        <UnbanUserDialog user={userItem} open onOpenChange={(o) => !o && closeAction()} />
      ) : null}
      {activeAction === 'role' ? (
        <ChangeRoleDialog user={userItem} open onOpenChange={(o) => !o && closeAction()} />
      ) : null}
      {activeAction === 'reset' ? (
        <ResetPasswordDialog user={userItem} open onOpenChange={(o) => !o && closeAction()} />
      ) : null}
      {activeAction === 'delete' ? (
        <DeleteUserDialog user={userItem} open onOpenChange={(o) => !o && closeAction()} />
      ) : null}
      {activeAction === 'grantPro' ? (
        <GrantProDialog user={userItem} open onOpenChange={(o) => !o && closeAction()} />
      ) : null}
      {activeAction === 'revokePro' ? (
        <RevokeProDialog user={userItem} open onOpenChange={(o) => !o && closeAction()} />
      ) : null}
      {activeAction === 'clearOverride' ? (
        <ClearOverrideDialog user={userItem} open onOpenChange={(o) => !o && closeAction()} />
      ) : null}
      {activeAction === 'adjustBalance' ? (
        <AdjustBalanceDialog
          user={userItem}
          currentBalance={balance?.tokenCredits ?? null}
          open
          onOpenChange={(o) => !o && closeAction()}
        />
      ) : null}
      {activeAction === 'setBalance' ? (
        <SetBalanceDialog
          user={userItem}
          currentBalance={balance?.tokenCredits ?? null}
          open
          onOpenChange={(o) => !o && closeAction()}
        />
      ) : null}
    </div>
  );
}
