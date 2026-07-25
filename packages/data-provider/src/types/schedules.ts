import { z } from 'zod';

export const scheduleFrequencies = ['hourly', 'daily', 'weekdays', 'weekly'] as const;
export type ScheduleFrequency = (typeof scheduleFrequencies)[number];

export const scheduleTargets = ['new'] as const;
export type ScheduleTarget = (typeof scheduleTargets)[number];

export type ScheduleDisabledReason =
  | 'too_many_failures'
  | 'agent_deleted'
  | 'invalid_schedule'
  | 'permission_revoked'
  | 'insufficient_balance';

export type ScheduleRunStatus =
  | 'started'
  | 'requires_action'
  | 'success'
  | 'error'
  | 'interrupted'
  | 'skipped_overlap'
  | 'skipped_balance';

export const scheduleCadenceSchema = z.object({
  frequency: z.enum(scheduleFrequencies),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
});
export type TScheduleCadence = z.infer<typeof scheduleCadenceSchema>;

export const createSchedulePayloadSchema = z.object({
  name: z.string().trim().min(1).max(256),
  prompt: z.string().trim().min(1).max(32000),
  agent_id: z.string().trim().min(1),
  cadence: scheduleCadenceSchema,
  timezone: z.string().min(1),
  target: z.enum(scheduleTargets).default('new'),
  file_ids: z.array(z.string()).max(10).optional(),
  enabled: z.boolean().default(true),
});
export type TCreateSchedule = z.infer<typeof createSchedulePayloadSchema>;

export const updateSchedulePayloadSchema = createSchedulePayloadSchema.partial();
export type TUpdateSchedule = z.infer<typeof updateSchedulePayloadSchema>;

export type TScheduleLastRun = {
  conversationId?: string;
  status: ScheduleRunStatus;
  error?: string;
  firedAt: string;
};

export type TSchedule = {
  id: string;
  user: string;
  name: string;
  prompt: string;
  agent_id: string;
  cadence: TScheduleCadence;
  timezone: string;
  target: ScheduleTarget;
  file_ids?: string[];
  enabled: boolean;
  disabledReason?: ScheduleDisabledReason;
  nextRunAt?: string;
  lastRun?: TScheduleLastRun;
  runCount: number;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TScheduleRun = {
  scheduleId: string;
  scheduledFor: string;
  firedAt?: string;
  conversationId?: string;
  status: ScheduleRunStatus;
  error?: string;
  droppedFileIds?: string[];
  durationMs?: number;
};

export type TSchedulesResponse = {
  schedules: TSchedule[];
  limits: { maxPerUser: number };
};

export type TScheduleRunNowResponse = {
  scheduleId: string;
  conversationId: string;
  status: 'started';
};
