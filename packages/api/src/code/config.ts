import { logger } from '@librechat/data-schemas';
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
  listRegisteredIds: () => Promise<string[]>;
};

type StatefulCodeConfig = NonNullable<
  NonNullable<AppConfig['endpoints']>[EModelEndpoint.agents]
>['statefulCodeSessions'];
type CodeEnvironmentConfig = NonNullable<NonNullable<StatefulCodeConfig>['environments']>[number];

function isExecutableCodeEnvironment(environment: CodeEnvironmentConfig): boolean {
  return !(
    environment.pairing?.allowPrincipalWorkers === true &&
    environment.pairing.workerId == null &&
    environment.workerId == null
  );
}

function retainDeploymentCodeEnvironments(
  appConfig: AppConfig,
  deploymentConfig: AppConfig,
): AppConfig {
  const agents = appConfig.endpoints?.[EModelEndpoint.agents];
  const sessions = agents?.statefulCodeSessions;
  if (sessions == null) return appConfig;

  return {
    ...appConfig,
    endpoints: {
      ...appConfig.endpoints,
      [EModelEndpoint.agents]: {
        ...agents,
        statefulCodeSessions: {
          ...sessions,
          environments:
            deploymentConfig.endpoints?.[EModelEndpoint.agents]?.statefulCodeSessions
              ?.environments ?? [],
        },
      },
    },
  };
}

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

  let accessible: AccessibleCodeEnvironmentConfiguration[];
  let registeredIds: string[];
  try {
    [accessible, registeredIds] = await Promise.all([
      registry.listAccessibleConfigurations(actor),
      registry.listRegisteredIds(),
    ]);
  } catch (error) {
    logger.error(
      '[mergeAccessibleCodeEnvironments] Unable to authorize principal environments; retaining deployment environments:',
      error,
    );
    return retainDeploymentCodeEnvironments(appConfig, deploymentConfig);
  }
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
  const registeredAliasIds = new Set(
    registeredIds.filter((environmentId) => !deploymentEnvironments.has(environmentId)),
  );
  const principalEnvironments = accessible.flatMap(
    ({ controlPlaneId, baseURL: _persistedBaseURL, ...environment }) => {
      const controlPlane = deploymentEnvironments.get(controlPlaneId);
      if (controlPlane == null || deploymentEnvironments.has(environment.id)) return [];
      return [{ ...environment, baseURL: controlPlane.baseURL }];
    },
  );
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
  const existingEnvironments = sessions.environments ?? [];
  const filteredEnvironments = existingEnvironments.filter(
    (environment) => !registeredAliasIds.has(environment.id),
  );
  if (
    effectivePrincipalEnvironments.length === 0 &&
    filteredEnvironments.length === existingEnvironments.length
  ) {
    return appConfig;
  }
  let mergedEnvironments = [...filteredEnvironments, ...effectivePrincipalEnvironments].map(
    (environment) =>
      !isExecutableCodeEnvironment(environment) &&
      'default' in environment &&
      environment.default === true
        ? { ...environment, default: false as const }
        : environment,
  );
  if (
    mergedEnvironments.length > 0 &&
    !mergedEnvironments.some(
      (environment) =>
        isExecutableCodeEnvironment(environment) &&
        'default' in environment &&
        environment.default === true,
    )
  ) {
    const defaultIndex = mergedEnvironments.findIndex(isExecutableCodeEnvironment);
    if (defaultIndex >= 0) {
      mergedEnvironments = mergedEnvironments.map((environment, index) =>
        index === defaultIndex ? { ...environment, default: true as const } : environment,
      );
    }
  }

  return {
    ...appConfig,
    endpoints: {
      ...appConfig.endpoints,
      [EModelEndpoint.agents]: {
        ...agents,
        statefulCodeSessions: {
          ...sessions,
          environments: mergedEnvironments,
        },
      },
    },
  };
}
