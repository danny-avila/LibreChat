import {
  SystemRoles,
  AdminErrorCode,
  ADMIN_SCOPE_HEADER,
  ADMIN_PLATFORM_SCOPE,
} from 'librechat-data-provider';
import {
  getTenantId,
  isOperatorActing,
  PLATFORM_TENANT_ID,
  OrganizationStatus,
  SystemCapabilities,
} from '@librechat/data-schemas';
import type { IUser } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import { createOrganizationsHarness } from '~/organizations/__tests__/helpers/harness';
import { generateCapabilityCheck } from '~/middleware/capabilities';
import { createAuthUserLoader } from '~/organizations/identity';
import { configureOrganizations } from '~/organizations/mode';
import { createAdminScope } from './scope';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const harness = createOrganizationsHarness();

/** A capability check whose database grants nothing, so only the operator principal passes. */
const { hasCapability } = generateCapabilityCheck({
  getUserPrincipals: async () => [],
  hasCapabilityForPrincipals: async () => false,
});

interface Seen {
  tenantId?: string;
  operatorActing: boolean;
  user?: IUser;
  canManageConfigs: boolean;
}

function createResponse() {
  const res = { statusCode: 200, body: undefined as unknown } as Response & { body: unknown };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

/** Runs the scope for `user` with `scope`, reporting what the next handler saw (if it ran). */
async function runScope(user: IUser | undefined, scope?: string) {
  const adminScope = createAdminScope({ findOrganization: harness.methods.findOrganization });
  const req = {
    user,
    headers: scope ? { [ADMIN_SCOPE_HEADER]: scope } : {},
  } as unknown as ServerRequest;
  const res = createResponse();
  let observed: Promise<Seen> | undefined;
  await adminScope(req, res, () => {
    /* Started inside the scope, so it keeps the scope's async context across its awaits. */
    observed = (async () => {
      const actor = req.user;
      return {
        tenantId: getTenantId(),
        operatorActing: isOperatorActing(),
        user: actor,
        canManageConfigs: await hasCapability(
          { id: actor?.id ?? '', role: actor?.role ?? '', tenantId: actor?.tenantId },
          SystemCapabilities.MANAGE_CONFIGS,
        ),
      };
    })();
  });
  return { seen: observed ? await observed : undefined, res };
}

const loadSignedIn = async (member: IUser): Promise<IUser> =>
  (await createAuthUserLoader<IUser>({ getUserById: harness.methods.getUserById })(
    member._id.toString(),
    '-password',
  )) as IUser;

beforeAll(() => harness.start());
afterAll(() => harness.stop());
beforeEach(async () => {
  await harness.reset();
  configureOrganizations({ enabled: true });
});
afterEach(() => configureOrganizations(undefined));

async function operatorAndCustomer() {
  const operator = await harness.createAccount('operator@example.com', { name: 'Olive' });
  await harness.methods.claimPlatformOperator(operator._id);
  const customer = await harness.createAccount('customer@example.com');
  const [own, theirs] = await Promise.all([
    harness.createOrganizationWithMember(operator),
    harness.createOrganizationWithMember(customer),
  ]);
  return { operator, own, theirs };
}

describe('createAdminScope', () => {
  it('leaves the request alone when organizations are disabled', async () => {
    configureOrganizations(undefined);
    const user = { _id: 'u1', id: 'u1', role: SystemRoles.ADMIN } as unknown as IUser;

    const { seen } = await runScope(user);

    expect(seen?.user).toBe(user);
    expect(seen?.operatorActing).toBe(false);
  });

  it('refuses anyone who is not the platform operator', async () => {
    const { theirs } = await operatorAndCustomer();

    const { seen, res } = await runScope(await loadSignedIn(theirs.member));

    expect(seen).toBeUndefined();
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error_code: AdminErrorCode.OPERATOR_REQUIRED });
  });

  it('refuses a member record that claims the operator flag for itself', async () => {
    const { theirs } = await operatorAndCustomer();
    const forged = { ...(await loadSignedIn(theirs.member)), isPlatformOperator: true } as IUser;

    const { seen, res } = await runScope(forged);

    expect(seen).toBeUndefined();
    expect(res.statusCode).toBe(403);
  });

  it('acts as the operator, holding every capability, in the platform scope by default', async () => {
    const { operator, own } = await operatorAndCustomer();

    const { seen } = await runScope(await loadSignedIn(own.member));

    expect(seen).toMatchObject({
      tenantId: PLATFORM_TENANT_ID,
      operatorActing: true,
      canManageConfigs: true,
    });
    expect(seen?.user).toMatchObject({
      id: operator._id.toString(),
      role: SystemRoles.ADMIN,
      tenantId: undefined,
    });
    /* Outside the admin request, nobody holds the operator's capabilities. */
    await expect(
      hasCapability(
        { id: operator._id.toString(), role: SystemRoles.ADMIN },
        SystemCapabilities.MANAGE_CONFIGS,
      ),
    ).resolves.toBe(false);
  });

  it('acts inside the organization the scope header names', async () => {
    const { own, theirs } = await operatorAndCustomer();

    const { seen } = await runScope(await loadSignedIn(own.member), theirs.tenantId);

    expect(seen).toMatchObject({
      tenantId: theirs.tenantId,
      operatorActing: true,
      canManageConfigs: true,
    });
    expect(seen?.user?.tenantId).toBe(theirs.tenantId);
  });

  it('treats the platform scope value as the platform', async () => {
    const { own } = await operatorAndCustomer();

    const { seen } = await runScope(await loadSignedIn(own.member), ADMIN_PLATFORM_SCOPE);

    expect(seen?.tenantId).toBe(PLATFORM_TENANT_ID);
  });

  it('refuses a malformed, unknown or deleting organization', async () => {
    const { own, theirs } = await operatorAndCustomer();
    const signedIn = () => loadSignedIn(own.member);

    const malformed = await runScope(await signedIn(), 'not a tenant!');
    expect(malformed.res.statusCode).toBe(400);
    expect(malformed.res.body).toMatchObject({ error_code: AdminErrorCode.ADMIN_SCOPE_INVALID });

    const unknown = await runScope(await signedIn(), 'org_000000000000000000000000');
    expect(unknown.res.statusCode).toBe(404);
    expect(unknown.res.body).toMatchObject({ error_code: AdminErrorCode.ORGANIZATION_NOT_FOUND });

    await harness.methods.setOrganizationStatus(theirs.tenantId, OrganizationStatus.DELETING);
    const deleting = await runScope(await signedIn(), theirs.tenantId);
    expect(deleting.res.statusCode).toBe(409);
    expect(deleting.res.body).toMatchObject({ error_code: AdminErrorCode.ORGANIZATION_DELETING });
  });
});
