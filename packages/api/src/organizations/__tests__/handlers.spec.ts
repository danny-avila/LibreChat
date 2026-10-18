import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { runAsSystem, runInTenant, ACCOUNTS_TENANT_ID } from '@librechat/data-schemas';
import {
  SystemRoles,
  OrganizationErrorCode,
  OrganizationInviteKind,
  organizationsConfigSchema,
} from 'librechat-data-provider';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { IUser, ISession } from '@librechat/data-schemas';
import { createOrganizationHandlers, createCurrentSessionRevoker } from '../handlers';
import { createOrganizationsHarness, decodeJwtPayload } from './helpers/harness';
import { runWithTenantContext, buildTenantContext } from '~/middleware/tenant';
import { createAuthUserLoader, createAuthSessionHelpers } from '../identity';
import { generateOrganizationOnboardingToken } from '../onboarding';
import { createOrganizationAccountAuth } from '../auth';
import { createOrganizationService } from '../service';
import { createInviteService } from '../invites';
import { configureOrganizations } from '../mode';
import { createAuthIssuer } from '../issue';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const harness = createOrganizationsHarness();
const config = organizationsConfigSchema.parse({ enabled: true });
let app: express.Express;

/** Stands in for `requireJwtAuth`: verifies the bearer, loads the member, enters its tenant. */
function fakeRequireJwtAuth() {
  const load = createAuthUserLoader<IUser>({ getUserById: harness.methods.getUserById });
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const payload = token ? decodeJwtPayload(token) : undefined;
    const user = payload?.id
      ? await load(String(payload.id), '-password', payload.aid ? String(payload.aid) : undefined)
      : null;
    if (!user) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    (req as Request & { user: unknown }).user = Object.assign(user, { id: user._id.toString() });
    runWithTenantContext(buildTenantContext(req as never), next);
  };
}

function buildApp() {
  const { methods } = harness;
  const invites = createInviteService({
    db: methods,
    getConfig: () => config,
    sendEmail: async () => undefined,
    isEmailConfigured: () => false,
    clientDomain: 'https://chat.example.com',
    appName: 'SassyChat',
  });
  const organizations = createOrganizationService({ db: methods, getConfig: () => config });
  const issueAuthTokens = createAuthIssuer<IUser, ISession>({
    getUserById: methods.getUserById,
    createSession: methods.createSession,
    generateRefreshToken: methods.generateRefreshToken,
    generateToken: methods.generateToken,
    setLocalSessionCookies: (res, cookie) => res.cookie('refreshToken', cookie.refreshToken),
    setCloudFrontAuthCookies: () => undefined,
    listMembershipsForIdentity: methods.listMembershipsForIdentity,
    setLastActiveTenant: methods.setLastActiveTenant,
    generateOnboardingToken: (accountId) =>
      generateOrganizationOnboardingToken(accountId, process.env.JWT_SECRET!),
    getExpiries: () => ({ refreshTokenMs: 60_000, sessionMs: 60_000 }),
  });
  const sessions = createAuthSessionHelpers({ ...methods, isOrganizationsEnabled: () => true });
  const handlers = createOrganizationHandlers({
    organizations,
    invites,
    issueAuthTokens,
    revokeCurrentSession: createCurrentSessionRevoker({
      readRefreshToken: (req) =>
        /(?:^|;s*)refreshToken=([^;]+)/.exec(req.headers.cookie ?? '')?.[1],
      findSession: (query) => sessions.findAuthSession(query),
      deleteSession: sessions.deleteAuthSession,
    }),
  });
  const requireJwtAuth = fakeRequireJwtAuth();
  const requireAccount = createOrganizationAccountAuth({
    requireJwtAuth: requireJwtAuth as never,
    getUserById: methods.getUserById,
  });

  /** The handlers take the organization request shape; Express hands them its own. */
  const route = (handler: unknown) => handler as RequestHandler;
  const server = express();
  server.use(express.json());
  server.get('/organizations', route(requireAccount), route(handlers.listOrganizations));
  server.post('/organizations', route(requireAccount), route(handlers.createOrganization));
  server.post('/organizations/switch', route(requireAccount), route(handlers.switchOrganization));
  server.get('/organizations/invites/:token', route(handlers.previewInvite));
  server.post(
    '/organizations/invites/:token/accept',
    route(requireAccount),
    route(handlers.acceptInvite),
  );
  server.get(
    '/organizations/current',
    route(requireJwtAuth),
    route(handlers.getCurrentOrganization),
  );
  server.post(
    '/organizations/current/invites',
    route(requireJwtAuth),
    route(handlers.createInvite),
  );
  return { server, issueAuthTokens };
}

async function signIn(account: IUser, tenantId?: string) {
  const { issueAuthTokens } = buildApp();
  const cookies: string[] = [];
  const res = {
    cookie: (name: string, value: string) => cookies.push(`${name}=${value}`),
  } as unknown as Response;
  const issued = await runAsSystem(() =>
    issueAuthTokens(account._id, res, null, null, tenantId ? { tenantId } : {}),
  );
  return { token: issued.token!, cookie: cookies.join('; ') };
}

beforeAll(async () => {
  await harness.start();
  configureOrganizations({ enabled: true });
});
afterAll(async () => {
  configureOrganizations(undefined);
  await harness.stop();
});
beforeEach(async () => {
  await harness.reset();
  await runAsSystem(async () => {
    await Promise.all([
      mongoose.models.Role.deleteMany({}),
      mongoose.models.SystemGrant.deleteMany({}),
    ]);
  });
  app = buildApp().server;
});

describe('organization routes', () => {
  it('lets an account with no organization create one with its onboarding token', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const onboardingToken = generateOrganizationOnboardingToken(
      alice._id.toString(),
      process.env.JWT_SECRET!,
    );

    const response = await request(app)
      .post('/organizations')
      .set('Authorization', `Bearer ${onboardingToken}`)
      .send({ name: 'Acme' });

    expect(response.status).toBe(200);
    expect(response.body.organization).toMatchObject({ name: 'Acme' });
    expect(response.body.user).toMatchObject({ role: SystemRoles.ADMIN });
    expect(response.body.user).not.toHaveProperty('password');
    expect(decodeJwtPayload(response.body.token)).toMatchObject({
      id: response.body.user.id,
      aid: alice._id.toString(),
    });
  });

  it('switches the session to another of the account organizations and ends the previous one', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const acme = await harness.createOrganizationWithMember(alice);
    const beta = await harness.createOrganizationWithMember(alice);
    const session = await signIn(alice, acme.tenantId);

    const response = await request(app)
      .post('/organizations/switch')
      .set('Authorization', `Bearer ${session.token}`)
      .set('Cookie', session.cookie)
      .send({ organizationId: beta.tenantId });

    expect(response.status).toBe(200);
    expect(response.body.organization.id).toBe(beta.tenantId);
    expect(response.body.user.id).toBe(beta.member._id.toString());
    await expect(
      runInTenant(acme.tenantId, async () => mongoose.models.Session.countDocuments({})),
    ).resolves.toBe(0);

    const current = await request(app)
      .get('/organizations/current')
      .set('Authorization', `Bearer ${response.body.token}`);
    expect(current.body.organization.id).toBe(beta.tenantId);
  });

  it('refuses to switch into an organization the account does not belong to', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const bob = await harness.createAccount('bob@example.com');
    const acme = await harness.createOrganizationWithMember(alice);
    const bobs = await harness.createOrganizationWithMember(bob);
    const session = await signIn(alice, acme.tenantId);

    const response = await request(app)
      .post('/organizations/switch')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ organizationId: bobs.tenantId });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ code: OrganizationErrorCode.NOT_A_MEMBER });
  });

  it('lists only the signed-in account organizations, marking the current one', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const bob = await harness.createAccount('bob@example.com');
    const acme = await harness.createOrganizationWithMember(alice);
    await harness.createOrganizationWithMember(alice);
    await harness.createOrganizationWithMember(bob);
    const session = await signIn(alice, acme.tenantId);

    const response = await request(app)
      .get('/organizations')
      .set('Authorization', `Bearer ${session.token}`);

    expect(response.body.organizations).toHaveLength(2);
    expect(
      response.body.organizations.filter((entry: { current: boolean }) => entry.current),
    ).toEqual([
      expect.objectContaining({ organization: expect.objectContaining({ id: acme.tenantId }) }),
    ]);
  });

  it('runs an invite from creation through preview to acceptance into a new session', async () => {
    const alice = await harness.createAccount('alice@example.com', { name: 'Alice' });
    const acme = await harness.createOrganizationWithMember(alice, SystemRoles.ADMIN);
    await runInTenant(acme.tenantId, () => harness.methods.getRoleByName(SystemRoles.USER));
    const aliceSession = await signIn(alice, acme.tenantId);

    const created = await request(app)
      .post('/organizations/current/invites')
      .set('Authorization', `Bearer ${aliceSession.token}`)
      .send({ kind: OrganizationInviteKind.LINK });
    expect(created.status).toBe(201);
    const token = decodeURIComponent(created.body.url.split('/invite/')[1]);

    const preview = await request(app).get(`/organizations/invites/${token}`);
    expect(preview.body).toMatchObject({ organization: { id: acme.tenantId } });

    const bob = await harness.createAccount('bob@example.com');
    const onboardingToken = generateOrganizationOnboardingToken(
      bob._id.toString(),
      process.env.JWT_SECRET!,
    );
    const accepted = await request(app)
      .post(`/organizations/invites/${token}/accept`)
      .set('Authorization', `Bearer ${onboardingToken}`);

    expect(accepted.status).toBe(200);
    expect(accepted.body.organization.id).toBe(acme.tenantId);
    expect(accepted.body.user).toMatchObject({ role: SystemRoles.USER, tenantId: acme.tenantId });
  });

  it('refuses an onboarding token once the password changed after it was issued', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const onboardingToken = generateOrganizationOnboardingToken(
      alice._id.toString(),
      process.env.JWT_SECRET!,
    );
    await runAsSystem(async () => {
      await mongoose.models.User.updateOne(
        { _id: alice._id },
        { $set: { credentialsChangedAt: new Date(Date.now() + 1000) } },
      );
    });

    const response = await request(app)
      .post('/organizations')
      .set('Authorization', `Bearer ${onboardingToken}`)
      .send({ name: 'Acme' });

    expect(response.status).toBe(401);
  });

  it('answers a malformed or unknown invite token without leaking anything', async () => {
    const response = await request(app).get('/organizations/invites/not-a-token');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: OrganizationErrorCode.INVITE_NOT_FOUND });
  });

  it('never treats an account as a member on member-only routes', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const forged = await harness.methods.generateToken(
      { ...alice, _id: alice._id, tenantId: ACCOUNTS_TENANT_ID } as IUser,
      60_000,
    );

    const response = await request(app)
      .get('/organizations/current')
      .set('Authorization', `Bearer ${forged}`);

    expect(response.status).toBe(401);
  });
});
