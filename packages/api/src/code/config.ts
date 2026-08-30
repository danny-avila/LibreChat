import { EModelEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type {
  AccessibleCodeEnvironmentConfiguration,
  CodeEnvironmentPrincipalContext,
} from './environments';

type ConfigurationRegistry = {
  listAccessibleConfigurations: (
    actor: CodeEnvironmentPrincipalContext,
  ) => Promise<AccessibleCodeEnvironmentConfiguration[]>;
};

export async function mergeAccessibleCodeEnvironments({
  appConfig,
  actor,
  registry,
}: {
  appConfig: AppConfig;
  actor: CodeEnvironmentPrincipalContext;
  registry: ConfigurationRegistry;
}): Promise<AppConfig> {
  const agents = appConfig.endpoints?.[EModelEndpoint.agents];
  const sessions = agents?.statefulCodeSessions;
  if (sessions == null) return appConfig;

  const accessible = await registry.listAccessibleConfigurations(actor);
  if (accessible.length === 0) return appConfig;
  const deploymentIds = new Set(sessions.environments?.map((environment) => environment.id) ?? []);
  const principalEnvironments = accessible.filter(
    (environment) => !deploymentIds.has(environment.id),
  );
  if (principalEnvironments.length === 0) return appConfig;

  return {
    ...appConfig,
    endpoints: {
      ...appConfig.endpoints,
      [EModelEndpoint.agents]: {
        ...agents,
        statefulCodeSessions: {
          ...sessions,
          environments: [...(sessions.environments ?? []), ...principalEnvironments],
        },
      },
    },
  };
}
