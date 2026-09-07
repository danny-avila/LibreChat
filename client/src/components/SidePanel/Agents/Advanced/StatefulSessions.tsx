import { useFormContext } from 'react-hook-form';
import {
  AgentCapabilities,
  STATEFUL_CODE_ENVIRONMENTS,
  resolveStatefulCodeEnvironment,
  resolveAllowedStatefulCodeEnvironments,
} from 'librechat-data-provider';
import {
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  HoverCard,
  HoverCardPortal,
  HoverCardContent,
  HoverCardTrigger,
  CircleHelpIcon,
} from '@librechat/client';
import type { StatefulCodeEnvironment } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { useAuthContext, useGetAgentsConfig, useLocalize } from '~/hooks';
import { ESide } from '~/common';

const ENVIRONMENT_LABELS = {
  user: 'com_ui_stateful_code_environment_user',
  'agent-user': 'com_ui_stateful_code_environment_agent_user',
  conversation: 'com_ui_stateful_code_environment_conversation',
} as const;

const DEPLOYMENT_DEFAULT_ENVIRONMENT = '__deployment_default__';

export default function StatefulSessions() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { agentsConfig } = useGetAgentsConfig();
  const methods = useFormContext<AgentForm>();
  const { setValue, watch } = methods;

  const enabled = watch(AgentCapabilities.stateful_code_sessions) ?? false;
  const codeEnabled = watch(AgentCapabilities.execute_code);
  const environment = watch('stateful_code_environment') ?? 'user';
  const codeEnvironmentId = watch('code_environment_id');
  const configuredEnvironments = agentsConfig?.statefulCodeSessions?.allowedEnvironments;
  const executionEnvironments = agentsConfig?.statefulCodeSessions?.environments ?? [];
  const allowedEnvironments = resolveAllowedStatefulCodeEnvironments(configuredEnvironments);

  const handleChange = (value: boolean) => {
    setValue(AgentCapabilities.stateful_code_sessions, value, { shouldDirty: true });
    const currentEnvironment = watch('stateful_code_environment');
    if (value && (!currentEnvironment || !allowedEnvironments.includes(currentEnvironment))) {
      setValue(
        'stateful_code_environment',
        resolveStatefulCodeEnvironment(
          user?.personalization?.statefulCodeEnvironment ?? 'user',
          configuredEnvironments,
        ) ?? 'user',
        { shouldDirty: true },
      );
    }
  };

  return (
    <div className="space-y-3">
      <HoverCard openDelay={50}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={codeEnabled ? 'text-sm' : 'text-sm text-text-tertiary'}>
              {localize('com_ui_stateful_sessions')}
            </div>
            <HoverCardTrigger>
              <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
            </HoverCardTrigger>
          </div>
          <HoverCardPortal>
            <HoverCardContent side={ESide.Top} className="w-80">
              <div className="space-y-2">
                <p className="text-sm text-text-secondary">
                  {localize('com_nav_info_stateful_sessions')}
                </p>
              </div>
            </HoverCardContent>
          </HoverCardPortal>
          <Switch
            id="stateful-code-sessions"
            checked={enabled && codeEnabled === true}
            onCheckedChange={handleChange}
            className="ml-4"
            data-testid="stateful-code-sessions"
            disabled={codeEnabled !== true}
            aria-label={localize('com_ui_stateful_sessions')}
          />
        </div>
      </HoverCard>
      {enabled && codeEnabled === true && (
        <div className="space-y-2 pl-1">
          {executionEnvironments.length > 0 && (
            <>
              <label
                className="text-xs font-medium text-text-secondary"
                htmlFor="code-environment-id"
              >
                {localize('com_ui_code_environment')}
              </label>
              <Select
                value={codeEnvironmentId ?? DEPLOYMENT_DEFAULT_ENVIRONMENT}
                onValueChange={(value) => {
                  setValue(
                    'code_environment_id',
                    value === DEPLOYMENT_DEFAULT_ENVIRONMENT ? null : value,
                    { shouldDirty: true },
                  );
                }}
              >
                <SelectTrigger id="code-environment-id" data-testid="code-environment-id">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEPLOYMENT_DEFAULT_ENVIRONMENT}>
                    {localize('com_ui_code_environment_deployment_default')}
                  </SelectItem>
                  {executionEnvironments.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name}
                      {candidate.type === 'attached'
                        ? ` (${localize('com_ui_code_environment_attached')})`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-text-tertiary">
                {localize('com_nav_info_code_environment')}
              </p>
            </>
          )}
          <label
            className="text-xs font-medium text-text-secondary"
            htmlFor="stateful-code-environment"
          >
            {localize('com_ui_stateful_code_environment')}
          </label>
          <Select
            value={environment}
            onValueChange={(value) => {
              const nextEnvironment = value as StatefulCodeEnvironment;
              if (allowedEnvironments.includes(nextEnvironment)) {
                setValue('stateful_code_environment', nextEnvironment, { shouldDirty: true });
              }
            }}
          >
            <SelectTrigger id="stateful-code-environment" data-testid="stateful-code-environment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATEFUL_CODE_ENVIRONMENTS.filter(
                (candidate) => allowedEnvironments.includes(candidate) || candidate === environment,
              ).map((candidate) => (
                <SelectItem
                  key={candidate}
                  value={candidate}
                  disabled={!allowedEnvironments.includes(candidate)}
                >
                  {localize(ENVIRONMENT_LABELS[candidate])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-text-tertiary">
            {localize('com_nav_info_stateful_code_environment')}
          </p>
        </div>
      )}
    </div>
  );
}
