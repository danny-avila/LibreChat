import { useState } from 'react';
import { Plus, Play, Pencil, Trash2, Clock } from 'lucide-react';
import { Button, OGDialog, OGDialogContent, Spinner, useToastContext } from '@librechat/client';
import type { TSkillSchedule } from 'librechat-data-provider';
import {
  useSkillSchedulesQuery,
  useRunSkillScheduleMutation,
  useDeleteSkillScheduleMutation,
  useUpdateSkillScheduleMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import ScheduleForm from './ScheduleForm';
import { cn } from '~/utils';

function formatNext(schedule: TSkillSchedule, localize: ReturnType<typeof useLocalize>): string {
  if (!schedule.enabled) {
    return localize('com_ui_scheduled_skills_paused');
  }
  if (!schedule.nextRunAt) {
    return localize('com_ui_scheduled_skills_no_upcoming');
  }
  try {
    return new Date(schedule.nextRunAt).toLocaleString();
  } catch {
    return schedule.nextRunAt;
  }
}

interface ScheduledSkillsPanelProps {
  className?: string;
}

export default function ScheduledSkillsPanel({ className }: ScheduledSkillsPanelProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data, isLoading } = useSkillSchedulesQuery();
  const runMutation = useRunSkillScheduleMutation();
  const deleteMutation = useDeleteSkillScheduleMutation();
  const updateMutation = useUpdateSkillScheduleMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TSkillSchedule | undefined>(undefined);

  const schedules = data?.schedules ?? [];

  const openCreate = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };

  const openEdit = (schedule: TSkillSchedule) => {
    setEditing(schedule);
    setDialogOpen(true);
  };

  const handleRun = (schedule: TSkillSchedule) => {
    runMutation.mutate(schedule._id, {
      onSuccess: () =>
        showToast({ message: localize('com_ui_scheduled_skills_run_started'), status: 'success' }),
      onError: () => showToast({ message: localize('com_ui_error'), status: 'error' }),
    });
  };

  const handleDelete = (schedule: TSkillSchedule) => {
    deleteMutation.mutate(schedule._id);
  };

  const toggleEnabled = (schedule: TSkillSchedule) => {
    updateMutation.mutate({ id: schedule._id, payload: { enabled: !schedule.enabled } });
  };

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col overflow-hidden border-r border-border-light',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border-light p-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Clock className="h-4 w-4" />
          {localize('com_ui_scheduled_skills')}
        </h2>
        <Button size="sm" onClick={openCreate} aria-label={localize('com_ui_scheduled_skills_new')}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex justify-center p-4">
            <Spinner />
          </div>
        ) : schedules.length === 0 ? (
          <p className="p-4 text-center text-sm text-text-secondary">
            {localize('com_ui_scheduled_skills_empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {schedules.map((schedule) => (
              <li
                key={schedule._id}
                className="rounded-lg border border-border-light p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {schedule.name}
                    </p>
                    <p className="truncate text-xs text-text-secondary">
                      {schedule.skillName || localize('com_ui_scheduled_skills_prompt_only')}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {localize('com_ui_scheduled_skills_next')}: {formatNext(schedule, localize)}
                    </p>
                    {schedule.lastStatus === 'error' && (
                      <p className="mt-1 text-xs text-red-500">
                        {localize('com_ui_scheduled_skills_last_error')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRun(schedule)}
                    disabled={runMutation.isLoading}
                    aria-label={localize('com_ui_scheduled_skills_run_now')}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(schedule)}
                    aria-label={localize('com_ui_edit')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleEnabled(schedule)}
                  >
                    {schedule.enabled
                      ? localize('com_ui_scheduled_skills_pause')
                      : localize('com_ui_scheduled_skills_resume')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(schedule)}
                    aria-label={localize('com_ui_delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <OGDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <OGDialogContent className="max-w-lg overflow-y-auto">
          <h3 className="mb-4 text-lg font-semibold text-text-primary">
            {editing
              ? localize('com_ui_scheduled_skills_edit')
              : localize('com_ui_scheduled_skills_new')}
          </h3>
          <ScheduleForm schedule={editing} onClose={() => setDialogOpen(false)} />
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}
