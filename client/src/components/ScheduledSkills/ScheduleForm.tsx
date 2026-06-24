import { useMemo, useState } from 'react';
import { Button, Input, TextareaAutosize, useToastContext } from '@librechat/client';
import type { TSkillSchedule, TCreateSkillSchedule } from 'librechat-data-provider';
import {
  useListSkillsQuery,
  useListAgentsQuery,
  useCreateSkillScheduleMutation,
  useUpdateSkillScheduleMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const WEEKDAYS = [
  { value: 0, key: 'com_ui_day_sun' },
  { value: 1, key: 'com_ui_day_mon' },
  { value: 2, key: 'com_ui_day_tue' },
  { value: 3, key: 'com_ui_day_wed' },
  { value: 4, key: 'com_ui_day_thu' },
  { value: 5, key: 'com_ui_day_fri' },
  { value: 6, key: 'com_ui_day_sat' },
] as const;

const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** Parses an existing cron `m h * * d` back into time + selected weekdays. */
function parseCron(cron?: string): { time: string; days: number[] } {
  if (!cron) {
    return { time: '09:00', days: [] };
  }
  const [minute, hour, , , dow] = cron.split(/\s+/);
  const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  const days =
    dow === '*' || dow == null
      ? []
      : dow
          .split(',')
          .map((d) => parseInt(d, 10))
          .filter((d) => !Number.isNaN(d));
  return { time, days };
}

interface ScheduleFormProps {
  schedule?: TSkillSchedule;
  onClose: () => void;
}

export default function ScheduleForm({ schedule, onClose }: ScheduleFormProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const createMutation = useCreateSkillScheduleMutation();
  const updateMutation = useUpdateSkillScheduleMutation();

  const skillsQuery = useListSkillsQuery({ limit: 100 });
  const agentsQuery = useListAgentsQuery();
  const skills = skillsQuery.data?.skills ?? [];
  const agents = agentsQuery.data?.data ?? [];

  const initialCron = parseCron(schedule?.cron);
  const [name, setName] = useState(schedule?.name ?? '');
  const [prompt, setPrompt] = useState(schedule?.prompt ?? '');
  const [skillName, setSkillName] = useState(schedule?.skillName ?? '');
  const [agentId, setAgentId] = useState(schedule?.agent_id ?? '');
  const [scheduleType, setScheduleType] = useState(schedule?.scheduleType ?? 'recurring');
  const [time, setTime] = useState(initialCron.time);
  const [days, setDays] = useState<number[]>(initialCron.days);
  const [runAt, setRunAt] = useState(schedule?.runAt ? schedule.runAt.slice(0, 16) : '');
  const [timezone] = useState(schedule?.timezone ?? browserTimezone());

  const saving = createMutation.isLoading || updateMutation.isLoading;

  const cron = useMemo(() => {
    const [hour, minute] = time.split(':');
    const dowField = days.length > 0 ? [...days].sort((a, b) => a - b).join(',') : '*';
    return `${parseInt(minute, 10)} ${parseInt(hour, 10)} * * ${dowField}`;
  }, [time, days]);

  const toggleDay = (value: number) => {
    setDays((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value],
    );
  };

  const handleSubmit = () => {
    if (!name.trim() || !prompt.trim()) {
      showToast({ message: localize('com_ui_scheduled_skills_required'), status: 'error' });
      return;
    }
    const payload: TCreateSkillSchedule = {
      name: name.trim(),
      prompt: prompt.trim(),
      skillName: skillName || undefined,
      agent_id: agentId || undefined,
      scheduleType,
      timezone,
    };
    if (scheduleType === 'recurring') {
      payload.cron = cron;
    } else {
      if (!runAt) {
        showToast({ message: localize('com_ui_scheduled_skills_pick_time'), status: 'error' });
        return;
      }
      payload.runAt = new Date(runAt).toISOString();
    }

    const onSuccess = () => {
      showToast({ message: localize('com_ui_saved'), status: 'success' });
      onClose();
    };
    const onError = () => {
      showToast({ message: localize('com_ui_error'), status: 'error' });
    };

    if (schedule) {
      updateMutation.mutate({ id: schedule._id, payload }, { onSuccess, onError });
    } else {
      createMutation.mutate(payload, { onSuccess, onError });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-primary">
          {localize('com_ui_name')}
        </label>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={128} />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-primary">
          {localize('com_ui_skills')}
        </label>
        <select
          className="rounded-md border border-border-medium bg-surface-primary p-2 text-sm text-text-primary"
          value={skillName}
          onChange={(e) => setSkillName(e.target.value)}
        >
          <option value="">{localize('com_ui_none')}</option>
          {skills.map((s) => (
            <option key={s._id} value={s.name}>
              {s.displayTitle || s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-primary">
          {localize('com_ui_scheduled_skills_prompt')}
        </label>
        <TextareaAutosize
          className="min-h-[80px] rounded-md border border-border-medium bg-surface-primary p-2 text-sm text-text-primary"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxRows={10}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-primary">
          {localize('com_ui_agent')}
        </label>
        <select
          className="rounded-md border border-border-medium bg-surface-primary p-2 text-sm text-text-primary"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
        >
          <option value="">{localize('com_ui_scheduled_skills_default_agent')}</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name || a.id}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-primary">
          {localize('com_ui_scheduled_skills_when')}
        </label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={scheduleType === 'recurring' ? 'default' : 'outline'}
            onClick={() => setScheduleType('recurring')}
          >
            {localize('com_ui_scheduled_skills_recurring')}
          </Button>
          <Button
            type="button"
            variant={scheduleType === 'once' ? 'default' : 'outline'}
            onClick={() => setScheduleType('once')}
          >
            {localize('com_ui_scheduled_skills_once')}
          </Button>
        </div>
      </div>

      {scheduleType === 'recurring' ? (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-primary">
              {localize('com_ui_scheduled_skills_time')}
            </label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-primary">
              {localize('com_ui_scheduled_skills_days')}
            </label>
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDay(d.value)}
                  className={cn(
                    'rounded-md border px-2 py-1 text-xs',
                    days.includes(d.value)
                      ? 'border-border-heavy bg-surface-tertiary text-text-primary'
                      : 'border-border-light text-text-secondary',
                  )}
                >
                  {localize(d.key)}
                </button>
              ))}
            </div>
            <span className="text-xs text-text-secondary">
              {days.length === 0
                ? localize('com_ui_scheduled_skills_every_day')
                : ''}
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-text-primary">
            {localize('com_ui_scheduled_skills_datetime')}
          </label>
          <Input
            type="datetime-local"
            value={runAt}
            onChange={(e) => setRunAt(e.target.value)}
          />
        </div>
      )}

      <span className="text-xs text-text-secondary">
        {localize('com_ui_scheduled_skills_timezone')}: {timezone}
      </span>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          {localize('com_ui_cancel')}
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {localize('com_ui_save')}
        </Button>
      </div>
    </div>
  );
}
