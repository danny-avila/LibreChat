import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, Spinner, TooltipAnchor } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useSchedulesQuery } from '~/data-provider';
import { useLocalize, useHasAccess } from '~/hooks';
import ScheduleDialog from './ScheduleDialog';
import ScheduleCard from './ScheduleCard';

export default function SchedulePanel() {
  const localize = useLocalize();
  const { data, isLoading } = useSchedulesQuery();
  const [createOpen, setCreateOpen] = useState(false);

  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.SCHEDULES,
    permission: Permissions.CREATE,
  });

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <Spinner />
      </div>
    );
  }

  const schedules = data?.schedules ?? [];
  const maxPerUser = data?.limits.maxPerUser;
  const atLimit = maxPerUser !== undefined && schedules.length >= maxPerUser;

  return (
    <div className="flex h-auto w-full flex-col px-3 pb-3 pt-2">
      <div role="region" aria-label={localize('com_ui_schedules')} className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-text-primary">
            {localize('com_ui_schedules')}
          </span>
          {hasCreateAccess && (
            <TooltipAnchor
              description={localize('com_ui_schedule_new')}
              side="bottom"
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 shrink-0 bg-transparent"
                  aria-label={localize('com_ui_schedule_new')}
                  disabled={atLimit}
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="size-4" aria-hidden="true" />
                </Button>
              }
            />
          )}
        </div>
        {schedules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-light p-4 text-center">
            <p className="text-sm text-text-secondary">{localize('com_ui_schedules_empty')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {schedules.map((schedule) => (
              <ScheduleCard key={schedule.id} schedule={schedule} />
            ))}
          </div>
        )}
        {maxPerUser !== undefined && (
          <p className="text-xs text-text-secondary">
            {localize('com_ui_schedules_used', { used: schedules.length, max: maxPerUser })}
          </p>
        )}
        {createOpen && <ScheduleDialog open={createOpen} onOpenChange={setCreateOpen} />}
      </div>
    </div>
  );
}
