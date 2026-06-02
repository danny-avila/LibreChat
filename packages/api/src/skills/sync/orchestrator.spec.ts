import type { SkillSyncConfig } from 'librechat-data-provider';
import type { GitHubSkillSyncRunner } from './github';
import type { SkillSyncTriggerRunnerFactoryInput } from './orchestrator';
import { createSkillSyncTriggerOrchestrator } from './orchestrator';

type RunnerStatus = Awaited<ReturnType<GitHubSkillSyncRunner['getStatus']>>;
type RunnerRunResult = Awaited<ReturnType<GitHubSkillSyncRunner['runOnce']>>;

const source = {
  id: 'tenant-skills',
  owner: 'LibreChat',
  repo: 'skills',
  ref: 'main',
  paths: ['skills'],
  token: '${GITHUB_SKILLS_TOKEN}',
  tenantId: 'other-tenant',
};

function skillSync(
  overrides: Partial<NonNullable<SkillSyncConfig>['github']> = {},
): SkillSyncConfig {
  return {
    github: {
      enabled: true,
      intervalMinutes: 60,
      runOnStartup: true,
      sources: [source],
      ...overrides,
    },
  };
}

function statusFromConfig(config: SkillSyncConfig | undefined): RunnerStatus {
  const github = config?.github;
  return {
    enabled: github?.enabled ?? false,
    intervalMinutes: github?.intervalMinutes ?? 60,
    runOnStartup: github?.runOnStartup ?? false,
    sources:
      github?.sources.map((configuredSource) => ({
        provider: 'github',
        sourceId: configuredSource.id,
        tenantId: configuredSource.tenantId,
        status: 'idle',
        credentialKey: configuredSource.credentialKey,
        credentialPresent: Boolean(configuredSource.credentialKey || configuredSource.token),
        owner: configuredSource.owner,
        repo: configuredSource.repo,
        ref: configuredSource.ref,
        paths: configuredSource.paths,
        syncedSkillCount: 0,
        syncedFileCount: 0,
        deletedSkillCount: 0,
        deletedFileCount: 0,
        errorCode: undefined,
        errorMessage: undefined,
        startedAt: undefined,
        finishedAt: undefined,
        lastSuccessAt: undefined,
        lastFailureAt: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      })) ?? [],
    credentials: [],
    fineGrainedTokenRecommendation: 'Use a GitHub fine-grained personal access token.',
  };
}

function completedRun(): RunnerRunResult {
  return { status: 'completed', sources: [] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function createHarness(
  options: {
    status?: RunnerStatus;
    runOnce?: () => Promise<RunnerRunResult>;
  } = {},
) {
  const runners: Array<{
    input: SkillSyncTriggerRunnerFactoryInput;
    runner: GitHubSkillSyncRunner;
  }> = [];
  const logger = {
    warn: jest.fn(),
    error: jest.fn(),
  };
  const createRunner = jest.fn((input: SkillSyncTriggerRunnerFactoryInput) => {
    const runner: GitHubSkillSyncRunner = {
      getStatus: jest.fn(async () => options.status ?? statusFromConfig(await input.getConfig())),
      runOnce: jest.fn(options.runOnce ?? (async () => completedRun())),
    };
    runners.push({ input, runner });
    return runner;
  });
  const orchestrator = createSkillSyncTriggerOrchestrator({
    createRunner,
    logger,
  });
  return { createRunner, logger, orchestrator, runners };
}

describe('createSkillSyncTriggerOrchestrator', () => {
  it('starts request sync from resolved admin skillSync config and derives tenant from the request', async () => {
    const config = skillSync();
    const { orchestrator, runners } = createHarness();

    const started = await orchestrator.maybeRunForRequest({
      config: { skillSync: config, config: {} },
      user: { tenantId: 'tenant-a' },
    });

    const requestConfig = await runners[0].input.getConfig();
    expect(started).toBe(true);
    expect(runners[0].runner.runOnce).toHaveBeenCalledTimes(1);
    expect(requestConfig?.github?.runOnStartup).toBe(false);
    expect(requestConfig?.github?.sources[0]).toEqual(
      expect.objectContaining({ id: 'tenant-skills', tenantId: 'tenant-a' }),
    );
  });

  it('does not start request sync for base YAML skillSync config', async () => {
    const config = skillSync();
    const { createRunner, orchestrator } = createHarness();

    const started = await orchestrator.maybeRunForRequest({
      config: { skillSync: config, config: { skillSync: config } },
      user: { tenantId: 'tenant-a' },
    });

    expect(started).toBe(false);
    expect(createRunner).not.toHaveBeenCalled();
  });

  it('creates an admin request runner from resolved config without disabling startup runs', async () => {
    const config = skillSync();
    const { orchestrator, runners } = createHarness();

    const runner = orchestrator.getRunnerForAdminRequest({
      config: { skillSync: config, config: {} },
      user: { tenantId: 'tenant-a' },
    });
    const runnerConfig = await runners[0].input.getConfig();

    expect(runner).toBe(runners[0].runner);
    expect(runnerConfig?.github?.runOnStartup).toBe(true);
    expect(runnerConfig?.github?.sources[0]).toEqual(
      expect.objectContaining({ id: 'tenant-skills', tenantId: 'tenant-a' }),
    );
  });

  it('does not start request sync when the configured source is already running', async () => {
    const config = skillSync({ runOnStartup: false });
    const { orchestrator, runners } = createHarness({
      status: {
        ...statusFromConfig(config),
        sources: [
          {
            ...statusFromConfig(config).sources[0],
            status: 'running',
            startedAt: new Date(),
          },
        ],
      },
    });

    const started = await orchestrator.maybeRunForRequest({
      config: { skillSync: config, config: {} },
      user: { tenantId: 'tenant-a' },
    });

    expect(started).toBe(false);
    expect(runners[0].runner.runOnce).not.toHaveBeenCalled();
  });

  it('retries request sync when a running source status is stale', async () => {
    const config = skillSync({ runOnStartup: false });
    const { orchestrator, runners } = createHarness({
      status: {
        ...statusFromConfig(config),
        sources: [
          {
            ...statusFromConfig(config).sources[0],
            status: 'running',
            startedAt: new Date(Date.now() - 40 * 60 * 1000),
          },
        ],
      },
    });

    const started = await orchestrator.maybeRunForRequest({
      config: { skillSync: config, config: {} },
      user: { tenantId: 'tenant-a' },
    });

    expect(started).toBe(true);
    expect(runners[0].runner.runOnce).toHaveBeenCalledTimes(1);
  });

  it('suppresses duplicate request sync while an equivalent run is in flight', async () => {
    const pendingRun = deferred<RunnerRunResult>();
    const config = skillSync({ runOnStartup: false });
    const { orchestrator, runners } = createHarness({
      runOnce: () => pendingRun.promise,
    });

    const first = await orchestrator.maybeRunForRequest({
      config: { skillSync: config, config: {} },
      user: { tenantId: 'tenant-a' },
    });
    const second = await orchestrator.maybeRunForRequest({
      config: { skillSync: config, config: {} },
      user: { tenantId: 'tenant-a' },
    });

    pendingRun.resolve(completedRun());
    await flushPromises();

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(runners).toHaveLength(1);
    expect(runners[0].runner.runOnce).toHaveBeenCalledTimes(1);
  });
});
