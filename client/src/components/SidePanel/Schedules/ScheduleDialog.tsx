import { useMemo, useRef } from 'react';
import { v4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { PermissionBits, scheduleFrequencies } from 'librechat-data-provider';
import {
  Input,
  Label,
  Radio,
  Button,
  FieldMessage,
  Spinner,
  Dropdown,
  OGDialog,
  ControlCombobox,
  OGDialogTemplate,
  useToastContext,
} from '@librechat/client';
import type {
  TSchedule,
  TCreateSchedule,
  TScheduleCadence,
  ScheduleFrequency,
} from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import type { Meridiem } from './cadence';
import {
  useListAgentsQuery,
  useCreateScheduleMutation,
  useUpdateScheduleMutation,
} from '~/data-provider';
import { to12Hour, to24Hour, describeCadence, formatScheduleDay } from './cadence';
import { VariableEditor } from '~/components/Variables';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule?: TSchedule;
  triggerRef?: React.MutableRefObject<HTMLButtonElement | null>;
}

type ScheduleFormValues = {
  name: string;
  prompt: string;
  agent_id: string;
  frequency: ScheduleFrequency;
  hour12: number;
  minute: number;
  meridiem: Meridiem;
  dayOfWeek: number;
};

const FREQUENCY_LABELS: Record<ScheduleFrequency, TranslationKeys> = {
  hourly: 'com_ui_schedule_hourly',
  daily: 'com_ui_schedule_daily',
  weekdays: 'com_ui_schedule_weekdays',
  weekly: 'com_ui_schedule_weekly',
};

const BASE_MINUTES = [0, 15, 30, 45];

const FORM_ID = 'schedule-form';

const getDefaultValues = (schedule?: TSchedule): ScheduleFormValues => {
  if (!schedule) {
    return {
      name: '',
      prompt: '',
      agent_id: '',
      frequency: 'daily',
      hour12: 9,
      minute: 0,
      meridiem: 'AM',
      dayOfWeek: 1,
    };
  }
  const { hour12, meridiem } = to12Hour(schedule.cadence.hour);
  return {
    name: schedule.name,
    prompt: schedule.prompt,
    agent_id: schedule.agent_id,
    frequency: schedule.cadence.frequency,
    hour12,
    minute: schedule.cadence.minute,
    meridiem,
    dayOfWeek: schedule.cadence.daysOfWeek?.[0] ?? 1,
  };
};

type CadenceFormValues = Pick<
  ScheduleFormValues,
  'frequency' | 'hour12' | 'minute' | 'meridiem' | 'dayOfWeek'
>;

const buildCadence = (values: CadenceFormValues, overrideDays?: number[]): TScheduleCadence => {
  if (values.frequency === 'hourly') {
    return { frequency: 'hourly', hour: 0, minute: values.minute };
  }
  const hour = to24Hour(values.hour12, values.meridiem);
  if (values.frequency === 'weekly') {
    // `overrideDays` preserves a stored multi-day set (which this single-day
    // picker can't represent) when only the time — not the day — was changed.
    return {
      frequency: 'weekly',
      hour,
      minute: values.minute,
      daysOfWeek: overrideDays ?? [values.dayOfWeek],
    };
  }
  return { frequency: values.frequency, hour, minute: values.minute };
};

export default function ScheduleDialog({
  open,
  onOpenChange,
  schedule,
  triggerRef,
}: ScheduleDialogProps) {
  const localize = useLocalize();
  const { i18n } = useTranslation();
  const { showToast } = useToastContext();
  const locale = i18n.language;

  const {
    control,
    register,
    watch,
    handleSubmit,
    formState: { dirtyFields, errors },
  } = useForm<ScheduleFormValues>({
    defaultValues: getDefaultValues(schedule),
    mode: 'onChange',
  });
  /** The revision the form defaults were built from, captured at the same instant.
   *  The `schedule` prop keeps refreshing while the dialog is open (the schedules
   *  query polls), so fencing with the LIVE prop's revision would stamp a freshly
   *  refreshed revision onto a cadence rebuilt from this stale snapshot — exactly
   *  the overwrite the fence exists to refuse. */
  const openedConfigRevision = useRef(schedule?.configRevision);
  const frequency = watch('frequency');
  const hour12 = watch('hour12');
  const minute = watch('minute');
  const meridiem = watch('meridiem');
  const dayOfWeek = watch('dayOfWeek');

  const { data: agents } = useListAgentsQuery(
    { requiredPermission: PermissionBits.VIEW },
    { select: (res) => res.data },
  );

  const agentItems = useMemo(
    () => (agents ?? []).map((agent) => ({ label: agent.name || agent.id, value: agent.id })),
    [agents],
  );

  const frequencyOptions = useMemo(
    () =>
      scheduleFrequencies.map((value) => ({
        value,
        label: localize(FREQUENCY_LABELS[value]),
      })),
    [localize],
  );

  const hourOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => String(index + 1)),
    [],
  );

  const minuteOptions = useMemo(() => {
    const minutes = new Set(BASE_MINUTES);
    if (schedule) {
      minutes.add(schedule.cadence.minute);
    }
    return [...minutes]
      .sort((a, b) => a - b)
      .map((minute) => ({ value: String(minute), label: String(minute).padStart(2, '0') }));
  }, [schedule]);

  const meridiemOptions = useMemo(
    () => [
      { value: 'AM', label: localize('com_ui_schedule_am') },
      { value: 'PM', label: localize('com_ui_schedule_pm') },
    ],
    [localize],
  );

  const dayOptions = useMemo(
    () =>
      Array.from({ length: 7 }, (_, day) => ({
        value: String(day),
        label: formatScheduleDay(day, locale),
      })),
    [locale],
  );

  const timezone = useMemo(
    () => schedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    [schedule],
  );

  /** Idempotency key for the create being attempted. Held in a ref so every retry of
   *  the same intent reuses it, and rotated when the attempt SUCCEEDS or when the
   *  form content changes after a failed one (the server pins each key to the exact
   *  payload it first saw, so retrying edited content under the old key answers 409).
   *  `uuid` rather than `crypto.randomUUID`, which secure contexts gate — an HTTP/IP
   *  deployment would throw here and never open the dialog. */
  const createRequestId = useRef(v4());
  /** Fingerprint of the payload the current key was last attempted with. */
  const lastAttemptedPayload = useRef<string | null>(null);

  const createSchedule = useCreateScheduleMutation({
    onSuccess: () => {
      createRequestId.current = v4();
      lastAttemptedPayload.current = null;
      showToast({ message: localize('com_ui_schedule_created'), status: 'success' });
      onOpenChange(false);
    },
    onError: () => {
      showToast({ message: localize('com_ui_error'), status: 'error' });
    },
  });

  const updateSchedule = useUpdateScheduleMutation({
    onSuccess: () => {
      showToast({ message: localize('com_ui_schedule_updated'), status: 'success' });
      onOpenChange(false);
    },
    onError: (error) => {
      const status = (error as { response?: { status?: number } } | undefined)?.response?.status;
      showToast({
        message: localize(status === 409 ? 'com_ui_schedule_conflict' : 'com_ui_error'),
        status: 'error',
      });
    },
  });

  const isLoading = createSchedule.isLoading || updateSchedule.isLoading;

  /** The stored weekly days an edit deliberately keeps: the form's single-day picker
   *  only holds `daysOfWeek[0]`, so an untouched picker must not collapse a
   *  multi-day (API-created) weekly schedule. ONE rule, used by both the submitted
   *  cadence and the summary — a summary built without it told the user the schedule
   *  runs on one day while the submit preserved (and kept firing) all of them. */
  const resolvePreservedWeeklyDays = (nextFrequency: ScheduleFormValues['frequency']) =>
    schedule &&
    !dirtyFields.dayOfWeek &&
    !dirtyFields.frequency &&
    schedule.cadence.frequency === 'weekly' &&
    nextFrequency === 'weekly'
      ? schedule.cadence.daysOfWeek
      : undefined;

  const onSubmit = (values: ScheduleFormValues) => {
    if (schedule) {
      // Preserve the stored cadence entirely on a pure rename (no cadence control
      // touched).
      const cadenceTouched =
        dirtyFields.frequency ||
        dirtyFields.hour12 ||
        dirtyFields.minute ||
        dirtyFields.meridiem ||
        dirtyFields.dayOfWeek;
      const cadence = buildCadence(values, resolvePreservedWeeklyDays(values.frequency));
      // PATCH only the fields the user actually touched, like the cadence handling
      // above: submitting the whole form snapshot silently overwrites fields another
      // tab or session edited while this dialog sat open (the server's revision fence
      // reads the CURRENT revision, so it cannot catch a stale full-form write).
      const payload = {
        ...(dirtyFields.name ? { name: values.name.trim() } : {}),
        ...(dirtyFields.prompt ? { prompt: values.prompt.trim() } : {}),
        ...(dirtyFields.agent_id ? { agent_id: values.agent_id } : {}),
        ...(cadenceTouched ? { cadence } : {}),
      };
      // Nothing touched: a field-less PATCH is refused server-side (it would rotate
      // the schedule's fencing for a request that changes nothing), so just close.
      if (Object.keys(payload).length === 0) {
        onOpenChange(false);
        return;
      }
      updateSchedule.mutate({
        id: schedule.id,
        // Fence on the revision this dialog OPENED with (not the live prop, which
        // polling refreshes under the stale form): cadence is rebuilt whole from
        // the opening snapshot, so an edit from another tab would otherwise be
        // silently overwritten — the server answers 409 instead.
        payload: {
          ...payload,
          ...(openedConfigRevision.current != null
            ? { expectedConfigRevision: openedConfigRevision.current }
            : {}),
        },
      });
      return;
    }
    const content = {
      name: values.name.trim(),
      prompt: values.prompt.trim(),
      agent_id: values.agent_id,
      cadence: buildCadence(values),
      timezone,
      target: 'new' as const,
      enabled: true,
    };
    // STABLE across retries of the SAME intent, which is the whole point: the server
    // commits the row and arms it in two writes, so a failure between them leaves the
    // client unable to tell what persisted, and a fresh key per attempt would make
    // each retry a new schedule. But the server pins each key to the exact payload it
    // first saw — so once the user EDITS the form after a failed attempt, this is a
    // new intent and needs a new key, or the retry answers 409 until the dialog is
    // reopened.
    const fingerprint = JSON.stringify(content);
    if (lastAttemptedPayload.current != null && lastAttemptedPayload.current !== fingerprint) {
      createRequestId.current = v4();
    }
    lastAttemptedPayload.current = fingerprint;
    const payload: TCreateSchedule = {
      ...content,
      clientRequestId: createRequestId.current,
    };
    createSchedule.mutate(payload);
  };

  const summaryCadence = buildCadence(
    { frequency, hour12, minute, meridiem, dayOfWeek },
    resolvePreservedWeeklyDays(frequency),
  );
  const summary = `${describeCadence(summaryCadence, localize, locale)} · ${timezone}`;

  return (
    <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
      <OGDialogTemplate
        title={localize(schedule ? 'com_ui_schedule_edit' : 'com_ui_schedule_new')}
        showCloseButton={false}
        // The agent and time popovers cannot portal out of a focus-trapping dialog
        // (see below), so `overflow-visible` keeps them from being clipped. Only from
        // `md` up: the two-column layout fits well inside 90vh there, while narrow
        // viewports keep the template's scrolling so the footer stays reachable.
        className="w-11/12 md:max-w-3xl md:overflow-visible"
        main={
          <form id={FORM_ID} onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="schedule-name" className="text-sm font-medium text-text-primary">
                  {localize('com_ui_name')}
                </Label>
                <Input
                  id="schedule-name"
                  className="w-full"
                  placeholder={localize('com_ui_schedule_name_placeholder')}
                  aria-invalid={errors.name != null}
                  aria-describedby="schedule-name-message"
                  {...register('name', { required: localize('com_ui_field_required') })}
                />
                <FieldMessage id="schedule-name-message" message={errors.name?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="schedule-agent" className="text-sm font-medium text-text-primary">
                  {localize('com_ui_agent')}
                </Label>
                <Controller
                  name="agent_id"
                  control={control}
                  rules={{ required: localize('com_ui_field_required') }}
                  render={({ field }) => (
                    <ControlCombobox
                      selectedValue={field.value}
                      displayValue={
                        agentItems.find((item) => item.value === field.value)?.label ?? ''
                      }
                      selectPlaceholder={localize('com_ui_select_agent')}
                      searchPlaceholder={localize('com_agents_search_name')}
                      setValue={field.onChange}
                      onBlur={field.onBlur}
                      items={agentItems}
                      ariaLabel={localize('com_ui_agent')}
                      ariaInvalid={errors.agent_id != null}
                      ariaDescribedBy="schedule-agent-message"
                      selectId="schedule-agent"
                      isCollapsed={false}
                      showCarat={true}
                      placement="bottom-start"
                      // Radix traps focus inside the dialog, so a popover portaled to
                      // the body cannot be clicked, tabbed into, or typed in — and the
                      // trap fighting Ariakit for focus locks the page up.
                      portal={false}
                      matchTriggerWidth={true}
                      variant="field"
                    />
                  )}
                />
                <FieldMessage id="schedule-agent-message" message={errors.agent_id?.message} />
                <p className="text-xs text-text-secondary">
                  {localize('com_ui_schedule_target_new_chat')}
                </p>
              </div>
            </div>

            <Controller
              name="prompt"
              control={control}
              rules={{ required: localize('com_ui_field_required') }}
              render={({ field }) => (
                <div className="space-y-2">
                  <VariableEditor
                    id="schedule-prompt"
                    label={localize('com_ui_prompt')}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    inputRef={field.ref}
                    placeholder={localize('com_ui_schedule_prompt_placeholder')}
                    className="min-h-[120px] resize-none bg-transparent"
                    labelClassName="text-sm font-medium text-text-primary"
                    rows={4}
                    required={true}
                    invalid={errors.prompt != null}
                    describedBy="schedule-prompt-message"
                    showVariables={false}
                    portal={false}
                  />
                  <FieldMessage id="schedule-prompt-message" message={errors.prompt?.message} />
                </div>
              )}
            />

            <fieldset className="space-y-2">
              <legend>
                <Label
                  id="schedule-frequency-label"
                  className="text-sm font-medium text-text-primary"
                >
                  {localize('com_ui_schedule_frequency')}
                </Label>
              </legend>
              <Controller
                name="frequency"
                control={control}
                render={({ field }) => (
                  <Radio
                    options={frequencyOptions}
                    value={field.value}
                    onChange={(value) => field.onChange(value as ScheduleFrequency)}
                    fullWidth
                    aria-labelledby="schedule-frequency-label"
                  />
                )}
              />
            </fieldset>

            <div className="grid gap-4 md:grid-cols-2">
              {frequency === 'weekly' && (
                <fieldset className="space-y-2">
                  <legend>
                    <Label
                      id="schedule-day-label"
                      className="text-sm font-medium text-text-primary"
                    >
                      {localize('com_ui_schedule_day')}
                    </Label>
                  </legend>
                  <Controller
                    name="dayOfWeek"
                    control={control}
                    render={({ field }) => (
                      <Dropdown
                        value={String(field.value)}
                        onChange={(value) => field.onChange(Number(value))}
                        options={dayOptions}
                        variant="field"
                        portal={false}
                        aria-labelledby="schedule-day-label"
                        testId="schedule-day-select"
                      />
                    )}
                  />
                </fieldset>
              )}
              <fieldset className="space-y-2">
                <legend>
                  <Label id="schedule-time-label" className="text-sm font-medium text-text-primary">
                    {localize(
                      frequency === 'hourly'
                        ? 'com_ui_schedule_minutes_past_hour'
                        : 'com_ui_schedule_time',
                    )}
                  </Label>
                </legend>
                <div
                  className={cn(
                    'grid gap-2',
                    frequency === 'hourly' ? 'max-w-[8rem] grid-cols-1' : 'grid-cols-3',
                  )}
                >
                  {frequency !== 'hourly' && (
                    <Controller
                      name="hour12"
                      control={control}
                      render={({ field }) => (
                        <Dropdown
                          value={String(field.value)}
                          onChange={(value) => field.onChange(Number(value))}
                          options={hourOptions}
                          variant="field"
                          portal={false}
                          ariaLabel={localize('com_ui_schedule_hour')}
                          testId="schedule-hour-select"
                        />
                      )}
                    />
                  )}
                  <Controller
                    name="minute"
                    control={control}
                    render={({ field }) => (
                      <Dropdown
                        value={String(field.value)}
                        onChange={(value) => field.onChange(Number(value))}
                        options={minuteOptions}
                        variant="field"
                        portal={false}
                        ariaLabel={localize('com_ui_schedule_minute')}
                        testId="schedule-minute-select"
                      />
                    )}
                  />
                  {frequency !== 'hourly' && (
                    <Controller
                      name="meridiem"
                      control={control}
                      render={({ field }) => (
                        <Dropdown
                          value={field.value}
                          onChange={field.onChange}
                          options={meridiemOptions}
                          variant="field"
                          portal={false}
                          ariaLabel={localize('com_ui_schedule_meridiem')}
                          testId="schedule-meridiem-select"
                        />
                      )}
                    />
                  )}
                </div>
              </fieldset>
            </div>

            <p
              className="break-words rounded-lg bg-surface-secondary px-3 py-2 text-sm text-text-secondary"
              data-testid="schedule-summary"
            >
              {summary}
            </p>
          </form>
        }
        buttons={
          <Button
            type="submit"
            form={FORM_ID}
            variant="submit"
            disabled={isLoading}
            aria-label={localize(schedule ? 'com_ui_save' : 'com_ui_create')}
          >
            {isLoading ? (
              <Spinner className="size-4" />
            ) : (
              localize(schedule ? 'com_ui_save' : 'com_ui_create')
            )}
          </Button>
        }
      />
    </OGDialog>
  );
}
