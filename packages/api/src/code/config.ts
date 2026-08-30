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
  deploymentConfig,
  actor,
  registry,
}: {
  appConfig: AppConfig;
  deploymentConfig: AppConfig;
  actor: CodeEnvironmentPrincipalContext;
  registry: ConfigurationRegistry;
}): Promise<AppConfig> {
  const agents = appConfig.endpoints?.[EModelEndpoint.agents];
  const sessions = agents?.statefulCodeSessions;
  if (sessions == null) return appConfig;

  const accessible = await registry.listAccessibleConfigurations(actor);
  if (accessible.length === 0) return appConfig;
  const deploymentSessions =
    deploymentConfig.endpoints?.[EModelEndpoint.agents]?.statefulCodeSessions;
  const deploymentEnvironments = new Map(
    deploymentSessions?.environments
      ?.filter(
        (environment) =>
          environment.owner === 'deployment' &&
          environment.type === 'attached' &&
          environment.pairing != null,
      )
      .map((environment) => [environment.id, environment]) ?? [],
  );
  const principalEnvironments = accessible.flatMap(
    ({ controlPlaneId, baseURL: _persistedBaseURL, ...environment }) => {
      const controlPlane = deploymentEnvironments.get(controlPlaneId);
      if (controlPlane == null || deploymentEnvironments.has(environment.id)) return [];
      return [{ ...environment, baseURL: controlPlane.baseURL }];
    },
  );
  if (principalEnvironments.length === 0) return appConfig;
  const principalEnvironmentIds = new Set(
    principalEnvironments.map((environment) => environment.id),
  );
  const shadowedDefaultIds = new Set(
    (sessions.environments ?? [])
      .filter(
        (environment) =>
          environment.default === true && principalEnvironmentIds.has(environment.id),
      )
      .map((environment) => environment.id),
  );
  const effectivePrincipalEnvironments = principalEnvironments.map((environment) =>
    shadowedDefaultIds.has(environment.id)
      ? { ...environment, default: true as const }
      : environment,
  );

  return {
    ...appConfig,
    endpoints: {
      ...appConfig.endpoints,
      [EModelEndpoint.agents]: {
        ...agents,
        statefulCodeSessions: {
          ...sessions,
          environments: [
            ...(sessions.environments ?? []).filter(
              (environment) => !principalEnvironmentIds.has(environment.id),
            ),
            ...effectivePrincipalEnvironments,
          ],
        },
      },
    },
  };
}
