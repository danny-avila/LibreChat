import { useEffect, useMemo, useState } from 'react';
import { PermissionBits } from 'librechat-data-provider';
import {
  Button,
  Input,
  Switch,
  Spinner,
  TextareaAutosize,
  useToastContext,
} from '@librechat/client';
import type { ScheduledTask } from 'librechat-data-provider';
import {
  useScheduledTasksQuery,
  useCreateScheduledTaskMutation,
  useUpdateScheduledTaskMutation,
  useDeleteScheduledTaskMutation,
  useRunScheduledTaskMutation,
  useListAgentsQuery,
} from '~/data-provider';
import { useLocalize } from '~/hooks';

const getDefaultTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (_error) {
    return 'UTC';
  }
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

const DAY_OF_WEEK_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
];

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => index);
const MINUTE_INTERVAL_OPTIONS = Array.from({ length: 59 }, (_, index) => index + 1);
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => index);
const DAY_OF_MONTH_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);

const getOrdinal = (value: number) => {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) {
    return `${value}th`;
  }
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
};

const toInt = (value: string, fallback: number) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

type CronBuilderState = {
  minuteMode: 'every' | 'at';
  minuteInterval: number;
  minuteAt: number;
  hourMode: 'every' | 'at' | 'range';
  hourAt: number;
  hourRangeStart: number;
  hourRangeEnd: number;
  dayMode: 'every' | 'weekdayRange' | 'dayOfMonth';
  dayOfWeekStart: number;
  dayOfWeekEnd: number;
  dayOfMonth: number;
  monthMode: 'every' | 'single' | 'range';
  month: number;
  monthRangeStart: number;
  monthRangeEnd: number;
};

const DEFAULT_CRON_BUILDER: CronBuilderState = {
  minuteMode: 'at',
  minuteInterval: 5,
  minuteAt: 0,
  hourMode: 'every',
  hourAt: 9,
  hourRangeStart: 9,
  hourRangeEnd: 17,
  dayMode: 'every',
  dayOfWeekStart: 1,
  dayOfWeekEnd: 5,
  dayOfMonth: 1,
  monthMode: 'every',
  month: 1,
  monthRangeStart: 4,
  monthRangeEnd: 9,
};

const normalizeRange = (start: number, end: number) => {
  if (start <= end) {
    return { start, end };
  }
  return { start: end, end: start };
};

const buildCronFromState = (state: CronBuilderState) => {
  const minute = state.minuteMode === 'every' ? `*/${state.minuteInterval}` : `${state.minuteAt}`;
  let hour = '*';
  if (state.hourMode === 'at') {
    hour = `${state.hourAt}`;
  } else if (state.hourMode === 'range') {
    const { start, end } = normalizeRange(state.hourRangeStart, state.hourRangeEnd);
    hour = `${start}-${end}`;
  }

  let dayOfMonth = '*';
  let dayOfWeek = '*';
  if (state.dayMode === 'weekdayRange') {
    const { start, end } = normalizeRange(state.dayOfWeekStart, state.dayOfWeekEnd);
    dayOfWeek = `${start}-${end}`;
  } else if (state.dayMode === 'dayOfMonth') {
    dayOfMonth = `${state.dayOfMonth}`;
  }

  let month = '*';
  if (state.monthMode === 'single') {
    month = `${state.month}`;
  } else if (state.monthMode === 'range') {
    const { start, end } = normalizeRange(state.monthRangeStart, state.monthRangeEnd);
    month = `${start}-${end}`;
  }

  return `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`;
};

const getDayLabel = (value: number) => {
  const day = value === 7 ? 0 : value;
  const match = DAY_OF_WEEK_OPTIONS.find((option) => option.value === (day === 0 ? 7 : day));
  return match?.label ?? 'Sunday';
};

const parseDayValue = (value: string) => {
  if (/^\d+$/.test(value)) {
    const numeric = Number.parseInt(value, 10);
    if (numeric === 0) {
      return 7;
    }
    if (numeric >= 1 && numeric <= 7) {
      return numeric;
    }
  }

  const upper = value.toUpperCase();
  const mapped = {
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6,
    SUN: 7,
  } as const;
  return mapped[upper as keyof typeof mapped] ?? null;
};

const parseMonthValue = (value: string) => {
  if (/^\d+$/.test(value)) {
    const numeric = Number.parseInt(value, 10);
    if (numeric >= 1 && numeric <= 12) {
      return numeric;
    }
  }

  const upper = value.toUpperCase();
  const mapped = {
    JAN: 1,
    FEB: 2,
    MAR: 3,
    APR: 4,
    MAY: 5,
    JUN: 6,
    JUL: 7,
    AUG: 8,
    SEP: 9,
    OCT: 10,
    NOV: 11,
    DEC: 12,
  } as const;
  return mapped[upper as keyof typeof mapped] ?? null;
};

const parseCronToBuilder = (cron: string): CronBuilderState | null => {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) {
    return null;
  }

  const [minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] = parts;
  const nextState: CronBuilderState = { ...DEFAULT_CRON_BUILDER };

  if (minuteField === '*') {
    nextState.minuteMode = 'every';
    nextState.minuteInterval = 1;
  } else if (/^\*\/\d+$/.test(minuteField)) {
    nextState.minuteMode = 'every';
    nextState.minuteInterval = Number.parseInt(minuteField.replace('*/', ''), 10);
  } else if (/^\d+$/.test(minuteField)) {
    nextState.minuteMode = 'at';
    nextState.minuteAt = Number.parseInt(minuteField, 10);
  } else {
    return null;
  }

  if (hourField === '*') {
    nextState.hourMode = 'every';
  } else if (/^\d+$/.test(hourField)) {
    nextState.hourMode = 'at';
    nextState.hourAt = Number.parseInt(hourField, 10);
  } else if (/^\d+-\d+$/.test(hourField)) {
    const [start, end] = hourField.split('-').map((value) => Number.parseInt(value, 10));
    nextState.hourMode = 'range';
    nextState.hourRangeStart = start;
    nextState.hourRangeEnd = end;
  } else {
    return null;
  }

  if (dayOfMonthField !== '*' && dayOfWeekField !== '*') {
    return null;
  }

  if (dayOfMonthField !== '*') {
    if (!/^\d+$/.test(dayOfMonthField)) {
      return null;
    }
    nextState.dayMode = 'dayOfMonth';
    nextState.dayOfMonth = Number.parseInt(dayOfMonthField, 10);
  } else if (dayOfWeekField !== '*') {
    const range = dayOfWeekField.split('-');
    if (range.length !== 2) {
      return null;
    }
    const start = parseDayValue(range[0]);
    const end = parseDayValue(range[1]);
    if (start == null || end == null) {
      return null;
    }
    nextState.dayMode = 'weekdayRange';
    nextState.dayOfWeekStart = start;
    nextState.dayOfWeekEnd = end;
  } else {
    nextState.dayMode = 'every';
  }

  if (monthField === '*') {
    nextState.monthMode = 'every';
  } else if (monthField.includes('-')) {
    const [startRaw, endRaw] = monthField.split('-');
    const start = parseMonthValue(startRaw);
    const end = parseMonthValue(endRaw);
    if (start == null || end == null) {
      return null;
    }
    nextState.monthMode = 'range';
    nextState.monthRangeStart = start;
    nextState.monthRangeEnd = end;
  } else {
    const parsed = parseMonthValue(monthField);
    if (parsed == null) {
      return null;
    }
    nextState.monthMode = 'single';
    nextState.month = parsed;
  }

  return nextState;
};

const describeCron = (cron: string) => {
  const parsed = parseCronToBuilder(cron);
  if (!parsed) {
    return cron;
  }

  let hourLabel = 'every hour';
  if (parsed.hourMode === 'at') {
    hourLabel = `at ${parsed.hourAt}`;
  } else if (parsed.hourMode === 'range') {
    const { start, end } = normalizeRange(parsed.hourRangeStart, parsed.hourRangeEnd);
    hourLabel = `from ${start} to ${end}`;
  }

  let minuteLabel = `every ${parsed.minuteInterval} minutes`;
  if (parsed.minuteMode === 'at') {
    minuteLabel = `at ${parsed.minuteAt}`;
  }

  let timeLabel = `${minuteLabel} ${hourLabel}`;
  if (parsed.minuteMode === 'at' && parsed.hourMode === 'at') {
    const hour = `${parsed.hourAt}`.padStart(2, '0');
    const minute = `${parsed.minuteAt}`.padStart(2, '0');
    timeLabel = `at ${hour}:${minute}`;
  }

  let dayLabel = 'every day';
  if (parsed.dayMode === 'weekdayRange') {
    const { start, end } = normalizeRange(parsed.dayOfWeekStart, parsed.dayOfWeekEnd);
    dayLabel = `every day from ${getDayLabel(start).toLowerCase()} to ${getDayLabel(end).toLowerCase()}`;
  } else if (parsed.dayMode === 'dayOfMonth') {
    dayLabel =
      parsed.monthMode === 'every'
        ? `the ${getOrdinal(parsed.dayOfMonth)} of each month`
        : `the ${getOrdinal(parsed.dayOfMonth)}`;
  }

  let monthLabel = 'every month';
  if (parsed.monthMode === 'single') {
    monthLabel = `in ${MONTH_OPTIONS[parsed.month - 1]?.label ?? 'month'}`.toLowerCase();
  } else if (parsed.monthMode === 'range') {
    const { start, end } = normalizeRange(parsed.monthRangeStart, parsed.monthRangeEnd);
    monthLabel = `from ${MONTH_OPTIONS[start - 1]?.label ?? 'month'} to ${
      MONTH_OPTIONS[end - 1]?.label ?? 'month'
    }`.toLowerCase();
  }

  return `${timeLabel} ${dayLabel} ${monthLabel}`;
};

export default function ScheduledTasksPanel() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: scheduledTasksData, isLoading } = useScheduledTasksQuery();
  const { data: agentList } = useListAgentsQuery({
    limit: 100,
    requiredPermission: PermissionBits.VIEW,
  });
  const scheduleLabels = {
    minute: localize('com_ui_schedule_minute'),
    hour: localize('com_ui_schedule_hour'),
    day: localize('com_ui_schedule_day'),
    month: localize('com_ui_schedule_month'),
    every: localize('com_ui_schedule_every'),
    at: localize('com_ui_schedule_at'),
    from: localize('com_ui_schedule_from'),
    to: localize('com_ui_schedule_to'),
    everyDay: localize('com_ui_schedule_every_day'),
    everyMonth: localize('com_ui_schedule_every_month'),
    in: localize('com_ui_schedule_in'),
    minutes: localize('com_ui_schedule_minutes'),
    preview: localize('com_ui_schedule_preview'),
    cron: localize('com_ui_schedule_cron_label'),
    the: localize('com_ui_schedule_the'),
    ofEachMonth: localize('com_ui_schedule_of_each_month'),
    of: localize('com_ui_schedule_of'),
  };

  const tasks = useMemo(() => scheduledTasksData?.data ?? [], [scheduledTasksData]);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [cronMode, setCronMode] = useState<'builder' | 'advanced'>('builder');
  const [cronBuilder, setCronBuilder] = useState<CronBuilderState>(DEFAULT_CRON_BUILDER);
  const [formState, setFormState] = useState({
    agentId: '',
    name: '',
    description: '',
    prompt: '',
    cron: buildCronFromState(DEFAULT_CRON_BUILDER),
    timezone: getDefaultTimezone(),
    enabled: true,
  });

  const createMutation = useCreateScheduledTaskMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_saved'), status: 'success' });
      setFormState({
        agentId: '',
        name: '',
        description: '',
        prompt: '',
        cron: buildCronFromState(DEFAULT_CRON_BUILDER),
        timezone: getDefaultTimezone(),
        enabled: true,
      });
      setCronMode('builder');
      setCronBuilder(DEFAULT_CRON_BUILDER);
    },
    onError: (error) => {
      showToast({ message: error?.message ?? localize('com_ui_error'), status: 'error' });
    },
  });

  const updateMutation = useUpdateScheduledTaskMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_saved'), status: 'success' });
      setEditingTaskId(null);
      setFormState({
        agentId: '',
        name: '',
        description: '',
        prompt: '',
        cron: buildCronFromState(DEFAULT_CRON_BUILDER),
        timezone: getDefaultTimezone(),
        enabled: true,
      });
      setCronMode('builder');
      setCronBuilder(DEFAULT_CRON_BUILDER);
    },
    onError: (error) => {
      showToast({ message: error?.message ?? localize('com_ui_error'), status: 'error' });
    },
  });

  const deleteMutation = useDeleteScheduledTaskMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_deleted'), status: 'success' });
    },
    onError: (error) => {
      showToast({ message: error?.message ?? localize('com_ui_error'), status: 'error' });
    },
  });

  const runMutation = useRunScheduledTaskMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_task_started'), status: 'success' });
    },
    onError: (error) => {
      showToast({ message: error?.message ?? localize('com_ui_error'), status: 'error' });
    },
  });

  const isEditing = editingTaskId != null;

  const handleEdit = (task: ScheduledTask) => {
    const parsedCron = parseCronToBuilder(task.cron);
    if (parsedCron) {
      setCronMode('builder');
      setCronBuilder(parsedCron);
    } else {
      setCronMode('advanced');
      setCronBuilder(DEFAULT_CRON_BUILDER);
    }
    setEditingTaskId(task.id);
    setFormState({
      agentId: task.agentId,
      name: task.name,
      description: task.description ?? '',
      prompt: task.prompt,
      cron: task.cron,
      timezone: task.timezone,
      enabled: task.enabled,
    });
  };

  const handleCancel = () => {
    setEditingTaskId(null);
    setFormState({
      agentId: '',
      name: '',
      description: '',
      prompt: '',
      cron: buildCronFromState(DEFAULT_CRON_BUILDER),
      timezone: getDefaultTimezone(),
      enabled: true,
    });
    setCronMode('builder');
    setCronBuilder(DEFAULT_CRON_BUILDER);
  };

  const handleSave = () => {
    if (!formState.agentId || !formState.name || !formState.prompt || !formState.cron) {
      showToast({ message: localize('com_ui_fill_required_fields'), status: 'error' });
      return;
    }

    const payload = {
      agentId: formState.agentId,
      name: formState.name,
      description: formState.description ? formState.description : null,
      prompt: formState.prompt,
      cron: formState.cron,
      timezone: formState.timezone,
      enabled: formState.enabled,
    };

    if (isEditing && editingTaskId) {
      updateMutation.mutate({ taskId: editingTaskId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleCronModeToggle = () => {
    if (cronMode === 'advanced') {
      const parsed = parseCronToBuilder(formState.cron);
      if (parsed) {
        setCronBuilder(parsed);
      } else {
        setCronBuilder(DEFAULT_CRON_BUILDER);
        setFormState((prev) => ({ ...prev, cron: buildCronFromState(DEFAULT_CRON_BUILDER) }));
      }
      setCronMode('builder');
      return;
    }
    setCronMode('advanced');
  };

  const updateCronBuilder = (patch: Partial<CronBuilderState>) => {
    setCronBuilder((prev) => ({ ...prev, ...patch }));
  };

  const cronPreview = useMemo(() => describeCron(formState.cron), [formState.cron]);

  useEffect(() => {
    if (cronMode !== 'builder') {
      return;
    }
    const cron = buildCronFromState(cronBuilder);
    if (cron !== formState.cron) {
      setFormState((prev) => ({ ...prev, cron }));
    }
  }, [cronBuilder, cronMode, formState.cron]);

  const minuteValueControl =
    cronBuilder.minuteMode === 'every' ? (
      <select
        className="rounded-md border border-border-light bg-background px-2 py-1 text-xs text-text-primary"
        value={cronBuilder.minuteInterval}
        onChange={(event) =>
          updateCronBuilder({
            minuteInterval: toInt(event.target.value, cronBuilder.minuteInterval),
          })
        }
      >
        {MINUTE_INTERVAL_OPTIONS.map((value) => (
          <option className="bg-background text-text-primary" key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    ) : (
      <select
        className="rounded-md border border-border-light bg-background px-2 py-1 text-xs text-text-primary"
        value={cronBuilder.minuteAt}
        onChange={(event) =>
          updateCronBuilder({
            minuteAt: toInt(event.target.value, cronBuilder.minuteAt),
          })
        }
      >
        {MINUTE_OPTIONS.map((value) => (
          <option className="bg-background text-text-primary" key={value} value={value}>
            {value.toString().padStart(2, '0')}
          </option>
        ))}
      </select>
    );

  let hourControls: JSX.Element | null = null;
  if (cronBuilder.hourMode === 'at') {
    hourControls = (
      <select
        className="rounded-md border border-border-light bg-background px-2 py-1 text-xs text-text-primary"
        value={cronBuilder.hourAt}
        onChange={(event) =>
          updateCronBuilder({
            hourAt: toInt(event.target.value, cronBuilder.hourAt),
          })
        }
      >
        {HOUR_OPTIONS.map((value) => (
          <option className="bg-background text-text-primary" key={value} value={value}>
            {value.toString().padStart(2, '0')}
          </option>
        ))}
      </select>
    );
  } else if (cronBuilder.hourMode === 'range') {
    hourControls = (
      <>
        <select
          className="rounded-md border border-border-light bg-background px-2 py-1 text-xs text-text-primary"
          value={cronBuilder.hourRangeStart}
          onChange={(event) =>
            updateCronBuilder({
              hourRangeStart: toInt(event.target.value, cronBuilder.hourRangeStart),
            })
          }
        >
          {HOUR_OPTIONS.map((value) => (
            <option className="bg-background text-text-primary" key={value} value={value}>
              {value.toString().padStart(2, '0')}
            </option>
          ))}
        </select>
        <span className="text-xs text-text-secondary">{scheduleLabels.to}</span>
        <select
          className="rounded-md border border-border-light bg-background px-2 py-1 text-xs text-text-primary"
          value={cronBuilder.hourRangeEnd}
          onChange={(event) =>
            updateCronBuilder({
              hourRangeEnd: toInt(event.target.value, cronBuilder.hourRangeEnd),
            })
          }
        >
          {HOUR_OPTIONS.map((value) => (
            <option className="bg-background text-text-primary" key={value} value={value}>
              {value.toString().padStart(2, '0')}
            </option>
          ))}
        </select>
      </>
    );
  }

  let dayControls: JSX.Element | null = null;
  if (cronBuilder.dayMode === 'weekdayRange') {
    dayControls = (
      <>
        <select
          className="rounded-md border border-border-light bg-background px-2 py-1 text-xs text-text-primary"
          value={cronBuilder.dayOfWeekStart}
          onChange={(event) =>
            updateCronBuilder({
              dayOfWeekStart: toInt(event.target.value, cronBuilder.dayOfWeekStart),
            })
          }
        >
          {DAY_OF_WEEK_OPTIONS.map((option) => (
            <option
              className="bg-background text-text-primary"
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-text-secondary">{scheduleLabels.to}</span>
        <select
          className="rounded-md border border-border-light bg-background px-2 py-1 text-xs text-text-primary"
          value={cronBuilder.dayOfWeekEnd}
          onChange={(event) =>
            updateCronBuilder({
              dayOfWeekEnd: toInt(event.target.value, cronBuilder.dayOfWeekEnd),
            })
          }
        >
          {DAY_OF_WEEK_OPTIONS.map((option) => (
            <option
              className="bg-background text-text-primary"
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
      </>
    );
  } else if (cronBuilder.dayMode === 'dayOfMonth') {
    dayControls = (
      <>
        <select
          className="rounded-md border border-border-light bg-background px-2 py-1 text-xs text-text-primary"
          value={cronBuilder.dayOfMonth}
          onChange={(event) =>
            updateCronBuilder({
              dayOfMonth: toInt(event.target.value, cronBuilder.dayOfMonth),
            })
          }
        >
          {DAY_OF_MONTH_OPTIONS.map((value) => (
            <option className="bg-background text-text-primary" key={value} value={value}>
              {getOrdinal(value)}
            </option>
          ))}
        </select>
        <span className="text-xs text-text-secondary">
          {cronBuilder.monthMode === 'every' ? scheduleLabels.ofEachMonth : scheduleLabels.of}
        </span>
      </>
    );
  }

  let monthControls: JSX.Element | null = null;
  if (cronBuilder.monthMode === 'single') {
    monthControls = (
      <select
        className="rounded-md border border-border-light bg-background px-2 py-1 text-xs text-text-primary"
        value={cronBuilder.month}
        onChange={(event) =>
          updateCronBuilder({
            month: toInt(event.target.value, cronBuilder.month),
          })
        }
      >
        {MONTH_OPTIONS.map((option) => (
          <option
            className="bg-background text-text-primary"
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (cronBuilder.monthMode === 'range') {
    monthControls = (
      <>
        <select
          className="rounded-md border border-border-light bg-background px-2 py-1 text-xs text-text-primary"
          value={cronBuilder.monthRangeStart}
          onChange={(event) =>
            updateCronBuilder({
              monthRangeStart: toInt(event.target.value, cronBuilder.monthRangeStart),
            })
          }
        >
          {MONTH_OPTIONS.map((option) => (
            <option
              className="bg-background text-text-primary"
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-text-secondary">{scheduleLabels.to}</span>
        <select
          className="rounded-md border border-border-light bg-background px-2 py-1 text-xs text-text-primary"
          value={cronBuilder.monthRangeEnd}
          onChange={(event) =>
            updateCronBuilder({
              monthRangeEnd: toInt(event.target.value, cronBuilder.monthRangeEnd),
            })
          }
        >
          {MONTH_OPTIONS.map((option) => (
            <option
              className="bg-background text-text-primary"
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
      </>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-4 p-2">
      <div className="rounded-lg border border-border-light bg-background p-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">
            {localize('com_sidepanel_scheduled_tasks')}
          </h3>
          {isEditing && (
            <span className="text-xs text-text-secondary">{localize('com_ui_edit')}</span>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-text-secondary">{localize('com_ui_agent')}</label>
            <select
              className="mt-1 w-full rounded-md border border-border-light bg-background px-2 py-2 text-sm text-text-primary"
              value={formState.agentId}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, agentId: event.target.value }))
              }
            >
              <option className="bg-background text-text-primary" value="">
                {localize('com_ui_select')}
              </option>
              {(agentList?.data ?? []).map((agent) => (
                <option className="bg-background text-text-primary" key={agent.id} value={agent.id}>
                  {agent.name || agent.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-text-secondary">{localize('com_ui_name')}</label>
            <Input
              value={formState.name}
              onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary">{localize('com_ui_description')}</label>
            <Input
              value={formState.description}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, description: event.target.value }))
              }
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary">{localize('com_ui_prompt')}</label>
            <TextareaAutosize
              className="mt-1 min-h-[72px] w-full resize-none rounded-md border border-border-light bg-transparent px-2 py-2 text-sm text-text-primary"
              value={formState.prompt}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, prompt: event.target.value }))
              }
            />
          </div>

          <div className="rounded-lg border border-border-light bg-background p-3">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs text-text-secondary">{localize('com_ui_cron')}</label>
              <Button size="sm" variant="ghost" type="button" onClick={handleCronModeToggle}>
                {cronMode === 'builder' ? localize('com_ui_advanced') : localize('com_ui_simple')}
              </Button>
            </div>

            {cronMode === 'builder' ? (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-[72px_1fr] items-center gap-2">
                  <span className="text-xs text-text-secondary">{scheduleLabels.minute}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-md border border-border-light bg-background px-2 py-1 text-xs text-text-primary"
                      value={cronBuilder.minuteMode}
                      onChange={(event) =>
                        updateCronBuilder({
                          minuteMode: event.target.value as CronBuilderState['minuteMode'],
                        })
                      }
                    >
                      <option className="bg-background text-text-primary" value="every">
                        {scheduleLabels.every}
                      </option>
                      <option className="bg-background text-text-primary" value="at">
                        {scheduleLabels.at}
                      </option>
                    </select>
                    {minuteValueControl}
                    <span className="text-xs text-text-secondary">{scheduleLabels.minutes}</span>
                  </div>
                </div>

                <div className="grid grid-cols-[72px_1fr] items-center gap-2">
                  <span className="text-xs text-text-secondary">{scheduleLabels.hour}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-md border border-border-light bg-background px-2 py-1 text-xs text-text-primary"
                      value={cronBuilder.hourMode}
                      onChange={(event) =>
                        updateCronBuilder({
                          hourMode: event.target.value as CronBuilderState['hourMode'],
                        })
                      }
                    >
                      <option className="bg-background text-text-primary" value="every">
                        {scheduleLabels.every}
                      </option>
                      <option className="bg-background text-text-primary" value="at">
                        {scheduleLabels.at}
                      </option>
                      <option className="bg-background text-text-primary" value="range">
                        {scheduleLabels.from}
                      </option>
                    </select>
                    {hourControls}
                  </div>
                </div>

                <div className="grid grid-cols-[72px_1fr] items-center gap-2">
                  <span className="text-xs text-text-secondary">{scheduleLabels.day}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-md border border-border-light bg-background px-2 py-1 text-xs text-text-primary"
                      value={cronBuilder.dayMode}
                      onChange={(event) =>
                        updateCronBuilder({
                          dayMode: event.target.value as CronBuilderState['dayMode'],
                        })
                      }
                    >
                      <option className="bg-background text-text-primary" value="every">
                        {scheduleLabels.everyDay}
                      </option>
                      <option className="bg-background text-text-primary" value="weekdayRange">
                        {scheduleLabels.from}
                      </option>
                      <option className="bg-background text-text-primary" value="dayOfMonth">
                        {scheduleLabels.the}
                      </option>
                    </select>
                    {dayControls}
                  </div>
                </div>

                <div className="grid grid-cols-[72px_1fr] items-center gap-2">
                  <span className="text-xs text-text-secondary">{scheduleLabels.month}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-md border border-border-light bg-background px-2 py-1 text-xs text-text-primary"
                      value={cronBuilder.monthMode}
                      onChange={(event) =>
                        updateCronBuilder({
                          monthMode: event.target.value as CronBuilderState['monthMode'],
                        })
                      }
                    >
                      <option className="bg-background text-text-primary" value="every">
                        {scheduleLabels.everyMonth}
                      </option>
                      <option className="bg-background text-text-primary" value="single">
                        {scheduleLabels.in}
                      </option>
                      <option className="bg-background text-text-primary" value="range">
                        {scheduleLabels.from}
                      </option>
                    </select>
                    {monthControls}
                  </div>
                </div>

                <div className="text-[11px] text-text-secondary">
                  {scheduleLabels.preview}: {cronPreview}
                </div>
                <div className="font-mono text-[11px] text-text-tertiary">
                  {scheduleLabels.cron}: {formState.cron}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Input
                  value={formState.cron}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, cron: event.target.value }))
                  }
                />
                <div className="text-[11px] text-text-secondary">
                  {scheduleLabels.preview}: {cronPreview}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-text-secondary">{localize('com_ui_timezone')}</label>
            <Input
              value={formState.timezone}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, timezone: event.target.value }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs text-text-secondary">{localize('com_ui_enabled')}</label>
            <Switch
              checked={formState.enabled}
              onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, enabled: checked }))}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" onClick={handleSave}>
            {localize('com_ui_save')}
          </Button>
          {isEditing && (
            <Button size="sm" variant="ghost" onClick={handleCancel}>
              {localize('com_ui_cancel')}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {tasks.length === 0 && (
          <div className="rounded-lg border border-dashed border-border-light p-4 text-center text-xs text-text-secondary">
            {localize('com_ui_empty')}
          </div>
        )}
        {tasks.map((task) => (
          <div
            key={task.id}
            className="rounded-lg border border-border-light bg-background px-3 py-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-text-primary">{task.name}</div>
                <div className="text-xs text-text-secondary">
                  {describeCron(task.cron)} · {task.timezone}
                </div>
                <div className="font-mono text-[11px] text-text-tertiary">{task.cron}</div>
              </div>
              <Switch
                checked={task.enabled}
                onCheckedChange={(checked) =>
                  updateMutation.mutate({ taskId: task.id, data: { enabled: checked } })
                }
              />
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-text-secondary">
              <div>
                <span className="font-medium">{localize('com_ui_last_run')}:</span>{' '}
                {formatDateTime(task.lastRunAt) ?? localize('com_ui_none')}
              </div>
              <div>
                <span className="font-medium">{localize('com_ui_next_run')}:</span>{' '}
                {formatDateTime(task.nextRunAt) ?? localize('com_ui_none')}
              </div>
              <div>
                <span className="font-medium">{localize('com_ui_status')}:</span>{' '}
                {task.lastRunStatus ?? localize('com_ui_none')}
              </div>
              <div>
                <span className="font-medium">{localize('com_ui_agent')}:</span> {task.agentId}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => runMutation.mutate(task.id)}>
                {localize('com_ui_run_now')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleEdit(task)}>
                {localize('com_ui_edit')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(task.id)}>
                {localize('com_ui_delete')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
