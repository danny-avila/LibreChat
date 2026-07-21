import { useId, useRef, useMemo, useState, useCallback } from 'react';
import * as Ariakit from '@ariakit/react';
import { useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Play, Trash, Pencil, Ellipsis } from 'lucide-react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import {
  Label,
  Switch,
  Spinner,
  OGDialog,
  DropdownPopup,
  OGDialogTemplate,
  useToastContext,
} from '@librechat/client';
import type { TSchedule, ScheduleRunStatus, ScheduleDisabledReason } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import {
  useGetAgentByIdQuery,
  useDeleteScheduleMutation,
  useUpdateScheduleMutation,
  useRunScheduleNowMutation,
} from '~/data-provider';
import { useLocalize, useHasAccess } from '~/hooks';
import { getMessageTimestamp, cn } from '~/utils';
import { useAgentsMapContext } from '~/Providers';
import ScheduleDialog from './ScheduleDialog';
import { describeCadence } from './cadence';

interface ScheduleCardProps {
  schedule: TSchedule;
}

const CHIP_BASE = 'rounded-full px-2 py-0.5 text-xs font-medium';
const GREEN_CHIP = 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
const RED_CHIP = 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
const AMBER_CHIP = 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300';
const NEUTRAL_CHIP = 'bg-surface-tertiary text-text-secondary';

const STATUS_CHIPS: Record<ScheduleRunStatus, { label: TranslationKeys; className: string }> = {
  success: { label: 'com_ui_schedule_last_run', className: GREEN_CHIP },
  error: { label: 'com_ui_schedule_last_run_failed', className: RED_CHIP },
  interrupted: { label: 'com_ui_schedule_last_run_failed', className: RED_CHIP },
  requires_action: { label: 'com_ui_schedule_needs_approval', className: AMBER_CHIP },
  started: { label: 'com_ui_schedule_run_started', className: NEUTRAL_CHIP },
  skipped_overlap: { label: 'com_ui_schedule_run_skipped', className: NEUTRAL_CHIP },
  skipped_balance: { label: 'com_ui_schedule_run_skipped', className: NEUTRAL_CHIP },
};

const DISABLED_REASON_LABELS: Record<ScheduleDisabledReason, TranslationKeys> = {
  too_many_failures: 'com_ui_schedule_disabled_too_many_failures',
  agent_deleted: 'com_ui_schedule_disabled_agent_deleted',
  invalid_schedule: 'com_ui_schedule_disabled_invalid',
  permission_revoked: 'com_ui_schedule_disabled_permission_revoked',
  insufficient_balance: 'com_ui_schedule_disabled_insufficient_balance',
};

export default function ScheduleCard({ schedule }: ScheduleCardProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const { showToast } = useToastContext();
  const agentsMap = useAgentsMapContext();
  // Enable/disable, run-now, edit and delete all hit CREATE-gated routes, so a
  // USE-only viewer sees a read-only card instead of controls that 403.
  const canWrite = useHasAccess({
    permissionType: PermissionTypes.SCHEDULES,
    permission: Permissions.CREATE,
  });

  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  const mappedAgent = agentsMap?.[schedule.agent_id];
  const { data: fetchedAgent } = useGetAgentByIdQuery(schedule.agent_id, {
    enabled: agentsMap !== undefined && mappedAgent == null,
  });
  const agentName = mappedAgent?.name || fetchedAgent?.name || schedule.agent_id;

  const updateSchedule = useUpdateScheduleMutation({
    onError: () => {
      showToast({ message: localize('com_ui_error'), status: 'error' });
    },
  });
  const deleteSchedule = useDeleteScheduleMutation();
  const runSchedule = useRunScheduleNowMutation();

  const handleToggle = useCallback(
    (checked: boolean) => {
      updateSchedule.mutate({ id: schedule.id, payload: { enabled: checked } });
    },
    [schedule.id, updateSchedule],
  );

  const handleRunNow = useCallback(() => {
    runSchedule.mutate(schedule.id, {
      onSuccess: () => {
        showToast({ message: localize('com_ui_schedule_run_now_started'), status: 'success' });
        setMenuOpen(false);
      },
      onError: () => {
        showToast({ message: localize('com_ui_error'), status: 'error' });
      },
    });
  }, [schedule.id, runSchedule, showToast, localize]);

  const confirmDelete = useCallback(() => {
    deleteSchedule.mutate(schedule.id, {
      onSuccess: () => {
        showToast({ message: localize('com_ui_deleted'), status: 'success' });
        setDeleteOpen(false);
      },
      onError: () => {
        showToast({ message: localize('com_ui_error'), status: 'error' });
      },
    });
  }, [schedule.id, deleteSchedule, showToast, localize]);

  const cadenceText = describeCadence(schedule.cadence, localize, i18n.language);

  const nextRunText = useMemo(() => {
    if (!schedule.enabled || schedule.nextRunAt == null) {
      return null;
    }
    const timestamp = getMessageTimestamp(schedule.nextRunAt, i18n.language);
    if (!timestamp) {
      return null;
    }
    return localize('com_ui_schedule_next_run', { time: timestamp.relative });
  }, [schedule.enabled, schedule.nextRunAt, i18n.language, localize]);

  const dropdownItems = useMemo(
    () => [
      {
        label: localize('com_ui_schedule_run_now'),
        onClick: handleRunNow,
        hideOnClick: false,
        icon: runSchedule.isLoading ? (
          <Spinner className="size-4" />
        ) : (
          <Play className="icon-sm mr-2 text-text-primary" aria-hidden="true" />
        ),
      },
      {
        label: localize('com_ui_edit'),
        onClick: () => setEditOpen(true),
        icon: <Pencil className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
        ariaHasPopup: 'dialog' as const,
        hideOnClick: false,
        ref: editButtonRef,
        render: (props) => <button {...props} />,
      },
      {
        label: localize('com_ui_delete'),
        onClick: () => setDeleteOpen(true),
        icon: <Trash className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
        ariaHasPopup: 'dialog' as const,
        hideOnClick: false,
        ref: deleteButtonRef,
        render: (props) => <button {...props} />,
      },
    ],
    [localize, handleRunNow, runSchedule.isLoading],
  );

  const statusChip = schedule.lastRun ? STATUS_CHIPS[schedule.lastRun.status] : null;
  const lastRunConvoId = schedule.lastRun?.conversationId;

  return (
    <div className="rounded-lg border border-border-light bg-transparent px-3 py-2.5 hover:bg-surface-secondary">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
          {schedule.name}
        </span>
        {canWrite && (
          <>
            <Switch
              checked={schedule.enabled}
              onCheckedChange={handleToggle}
              disabled={updateSchedule.isLoading}
              aria-label={localize('com_ui_schedule_enabled')}
              className="shrink-0"
            />
            <DropdownPopup
              portal={true}
              menuId={menuId}
              focusLoop={true}
              className="z-[125]"
              unmountOnHide={true}
              isOpen={menuOpen}
              setIsOpen={setMenuOpen}
              trigger={
                <Ariakit.MenuButton
                  id={`schedule-menu-${schedule.id}`}
                  aria-label={localize('com_ui_schedule_options')}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy"
                >
                  <Ellipsis className="size-4" aria-hidden={true} />
                </Ariakit.MenuButton>
              }
              items={dropdownItems}
            />
          </>
        )}
      </div>
      <p className="mt-0.5 truncate text-xs text-text-secondary" title={agentName}>
        {agentName}
      </p>
      <p className="mt-1 text-sm text-text-primary">{cadenceText}</p>
      {nextRunText != null && <p className="mt-0.5 text-xs text-text-secondary">{nextRunText}</p>}
      {(statusChip != null || schedule.disabledReason != null) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {statusChip != null &&
            (lastRunConvoId != null && lastRunConvoId !== '' ? (
              <button
                type="button"
                className={cn(CHIP_BASE, statusChip.className, 'hover:underline')}
                onClick={() => navigate(`/c/${lastRunConvoId}`)}
              >
                {localize(statusChip.label)}
              </button>
            ) : (
              <span className={cn(CHIP_BASE, statusChip.className)}>
                {localize(statusChip.label)}
              </span>
            ))}
          {schedule.disabledReason != null && (
            <span className={cn(CHIP_BASE, RED_CHIP)}>
              {localize(DISABLED_REASON_LABELS[schedule.disabledReason])}
            </span>
          )}
        </div>
      )}
      {editOpen && (
        <ScheduleDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          schedule={schedule}
          triggerRef={editButtonRef as React.MutableRefObject<HTMLButtonElement | null>}
        />
      )}
      <OGDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        triggerRef={deleteButtonRef as React.MutableRefObject<HTMLButtonElement | null>}
      >
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_ui_schedule_delete')}
          className="w-11/12 max-w-lg"
          main={
            <Label className="text-left text-sm font-medium">
              <Trans
                i18nKey="com_ui_delete_confirm_strong"
                values={{ title: schedule.name }}
                components={{ strong: <strong /> }}
              />
            </Label>
          }
          selection={{
            selectHandler: confirmDelete,
            selectClasses:
              'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
            selectText: localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    </div>
  );
}
