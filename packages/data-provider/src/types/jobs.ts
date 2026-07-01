export type TAgentJobStatus =
  | 'queued'
  | 'running'
  | 'waiting_client'
  | 'paused'
  | 'done'
  | 'error'
  | 'canceled';

export type TAgentJobStepStatus = 'running' | 'success' | 'error';

export type TAgentJobStep = {
  index: number;
  status: TAgentJobStepStatus;
  summary?: string;
  messageId?: string;
  startedAt?: string;
  endedAt?: string;
};

export type TAgentJob = {
  _id: string;
  user: string;
  conversationId: string;
  goal: string;
  agent_id?: string;
  endpoint?: string;
  endpointType?: string;
  model?: string;
  spec?: string;
  status: TAgentJobStatus;
  steps: TAgentJobStep[];
  currentStep: number;
  maxSteps: number;
  lastError?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TCreateAgentJob = {
  goal: string;
  conversationId?: string;
  agent_id?: string;
  endpoint?: string;
  endpointType?: string;
  model?: string;
  spec?: string;
  maxSteps?: number;
};

export type TAgentJobsResponse = {
  jobs: TAgentJob[];
};

export type TAgentJobResponse = {
  job: TAgentJob;
};

/** Payload pushed over the job SSE channel as the worker advances a job. */
export type TAgentJobUpdate = {
  type: 'step' | 'status';
  job: TAgentJob;
};
