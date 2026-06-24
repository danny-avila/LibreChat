export type TSkillScheduleType = 'once' | 'recurring';
export type TSkillScheduleStatus = 'pending' | 'running' | 'success' | 'error';

export type TSkillSchedule = {
  _id: string;
  user: string;
  name: string;
  enabled: boolean;
  prompt: string;
  skillName?: string;
  skillId?: string;
  agent_id?: string;
  endpoint?: string;
  endpointType?: string;
  model?: string;
  spec?: string;
  scheduleType: TSkillScheduleType;
  cron?: string;
  runAt?: string;
  timezone: string;
  nextRunAt?: string | null;
  lastRunAt?: string;
  lastConversationId?: string;
  lastStatus: TSkillScheduleStatus;
  lastError?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TCreateSkillSchedule = {
  name: string;
  prompt: string;
  scheduleType: TSkillScheduleType;
  timezone?: string;
  enabled?: boolean;
  skillName?: string;
  skillId?: string;
  agent_id?: string;
  endpoint?: string;
  endpointType?: string;
  model?: string;
  spec?: string;
  cron?: string;
  runAt?: string;
};

export type TUpdateSkillSchedule = Partial<TCreateSkillSchedule>;

export type TSkillSchedulesResponse = {
  schedules: TSkillSchedule[];
};

export type TSkillScheduleResponse = {
  schedule: TSkillSchedule;
};

export type TRunSkillScheduleResponse = {
  success: boolean;
  conversationId: string;
};
