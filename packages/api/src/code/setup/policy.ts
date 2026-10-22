import { runAsSystem, tenantStorage } from '@librechat/data-schemas';
import { normalizeBrowserEnrollmentInstance } from '@librechat/code/browser-enrollment';
import type { AppConfig, BrowserSetupSession } from '@librechat/data-schemas';
import type { GetAppConfigOptions } from '~/app/service';
import { resolveCodeWorkerEnrollmentLimit } from '../enrollment';
import { isTwoFactorEnrollmentRequired } from '~/auth/twoFactor';
import { getAppConfigOptionsFromUser } from '~/app/service';
import { getCodeApiTenantIdForUser } from '~/auth/codeapi';
import { isEnabled } from '~/utils/common';

export type SetupUser = {
  id: string;
  tenantId?: string;
  role?: string;
  idOnTheSource?: string | null;
  provider?: string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  termsAccepted?: boolean;
  agentTriggerDeletionStartedAt?: Date | null;
  expiresAt?: Date;
};

type Sessions = NonNullable<NonNullable<AppConfig['endpoints']>['agents']>['statefulCodeSessions'];
export type SetupPlane = NonNullable<NonNullable<Sessions>['environments']>[number];
export type SetupConfig = NonNullable<
  NonNullable<NonNullable<Sessions>['principalWorkers']>['browserSetup']
>;

export type SetupPolicy = {
  config: SetupConfig;
  planes: SetupPlane[];
  maxOwned: number;
  user?: SetupUser;
  tenantId?: string;
  codeTenantId?: string;
};

export class SetupPolicyError extends Error {
  constructor(
    public readonly code: 'SETUP_UNAVAILABLE' | 'ACCOUNT_UNAVAILABLE' | 'POLICY_WITHDRAWN',
  ) {
    super(code);
  }
}

export interface SetupPolicyDependencies {
  getAppConfig: (options: GetAppConfigOptions) => Promise<AppConfig>;
  getUser: (id: string) => Promise<SetupUser | null>;
  userIsBanned: (id: string) => Promise<boolean>;
  principalAuthEnabled: () => boolean;
  principalAuthReady: () => Promise<void> | void;
}

function sessions(config: AppConfig): Sessions {
  return config.endpoints?.agents?.statefulCodeSessions;
}

function planes(config: AppConfig): SetupPlane[] {
  return (
    sessions(config)?.environments?.filter(
      (plane) =>
        plane.type === 'attached' &&
        plane.owner === 'deployment' &&
        plane.pairing?.allowPrincipalWorkers === true &&
        plane.pairing.tokenEnv != null,
    ) ?? []
  );
}

function validConfig(config: AppConfig): SetupConfig {
  const settings = sessions(config)?.principalWorkers?.browserSetup;
  if (
    settings?.enabled !== true ||
    normalizeBrowserEnrollmentInstance(settings.instance) !== settings.instance
  ) {
    throw new SetupPolicyError('SETUP_UNAVAILABLE');
  }
  return settings;
}

/** This reader takes an identity, not a synthetic authenticated request. */
export function createSetupPolicy(deps: SetupPolicyDependencies): {
  deployment: () => Promise<SetupPolicy>;
  user: (id: string, expectedTenantId?: string) => Promise<SetupPolicy>;
  frozen: (session: BrowserSetupSession) => Promise<SetupPolicy>;
} {
  async function deployment(): Promise<SetupPolicy> {
    if (!deps.principalAuthEnabled()) throw new SetupPolicyError('SETUP_UNAVAILABLE');
    const [base] = await Promise.all([
      deps.getAppConfig({ baseOnly: true, failClosed: true, refresh: true }),
      deps.principalAuthReady(),
    ]);
    const config = validConfig(base);
    const maxOwned = resolveCodeWorkerEnrollmentLimit(sessions(base)?.principalWorkers);
    const authorized = planes(base);
    if (maxOwned === 0 || authorized.length === 0) throw new SetupPolicyError('SETUP_UNAVAILABLE');
    return { config, planes: authorized, maxOwned };
  }

  async function user(id: string, expectedTenantId?: string): Promise<SetupPolicy> {
    const [account, banned] = await Promise.all([
      runAsSystem(async () => deps.getUser(id)),
      deps.userIsBanned(id),
    ]);
    if (
      account == null ||
      account.id !== id ||
      account.agentTriggerDeletionStartedAt != null ||
      banned ||
      (account.expiresAt != null && account.expiresAt.getTime() <= Date.now()) ||
      isTwoFactorEnrollmentRequired(account) ||
      (account.provider === 'local' &&
        account.emailVerified !== true &&
        !isEnabled(process.env.ALLOW_UNVERIFIED_EMAIL_LOGIN)) ||
      (expectedTenantId != null && (account.tenantId ?? '') !== expectedTenantId)
    ) {
      throw new SetupPolicyError('ACCOUNT_UNAVAILABLE');
    }
    return await tenantStorage.run({ tenantId: account.tenantId, userId: id }, async () => {
      const [base, effective] = await Promise.all([
        deployment(),
        deps.getAppConfig({
          ...getAppConfigOptionsFromUser(account),
          refresh: true,
          failClosed: true,
          skipRuntimeAugmentation: true,
        }),
      ]);
      const effectiveSettings = sessions(effective)?.principalWorkers;
      if (
        effectiveSettings?.browserSetup?.enabled === false ||
        (effective.interfaceConfig?.termsOfService?.modalAcceptance === true &&
          account.termsAccepted !== true)
      ) {
        throw new SetupPolicyError('POLICY_WITHDRAWN');
      }
      const maxOwned = resolveCodeWorkerEnrollmentLimit(
        { maxPerUser: base.maxOwned },
        effectiveSettings,
      );
      const allowed = new Set(planes(effective).map(({ id: planeId }) => planeId));
      const authorized = base.planes.filter(({ id: planeId }) => allowed.has(planeId));
      if (maxOwned === 0 || authorized.length === 0) throw new SetupPolicyError('POLICY_WITHDRAWN');
      return {
        ...base,
        user: account,
        maxOwned,
        planes: authorized,
        tenantId: account.tenantId ?? '',
        codeTenantId: getCodeApiTenantIdForUser(account),
      };
    });
  }

  async function frozen(session: BrowserSetupSession): Promise<SetupPolicy> {
    if (session.ownerId == null || session.approval == null)
      throw new SetupPolicyError('POLICY_WITHDRAWN');
    const resolved = await user(session.ownerId, session.tenantId);
    const plane = resolved.planes.find(({ id }) => id === session.planeId);
    if (
      plane == null ||
      plane.baseURL.replace(/\/+$/, '') !== session.baseURL ||
      plane.pairing?.tokenEnv !== session.tokenEnv ||
      resolved.codeTenantId !== session.approval.binding.tenantId ||
      resolved.config.instance !== session.approval.instance
    ) {
      throw new SetupPolicyError('POLICY_WITHDRAWN');
    }
    return resolved;
  }

  return { deployment, user, frozen };
}

export type SetupPolicyReader = ReturnType<typeof createSetupPolicy>;
