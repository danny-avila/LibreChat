import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels, createArtifactAppMethods } from '@librechat/data-schemas';
import { ResourceType, AccessRoleIds } from 'librechat-data-provider';
import type { Types } from 'mongoose';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import { createArtifactAppHandlers } from '../handlers';

let mongoServer: MongoMemoryServer;
let methods: ReturnType<typeof createArtifactAppMethods>;
let handlers: ReturnType<typeof createArtifactAppHandlers>;

interface GrantRecord {
  principalId: string;
  resourceType: string;
  resourceId: string;
  accessRoleId: string;
}

let grants: GrantRecord[];
let auditActions: string[];
let accessibleIds: Types.ObjectId[];

function makeRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

function makeReq(overrides: Partial<ServerRequest>): ServerRequest {
  return {
    user: { id: 'user-1', name: 'User One', tenantId: undefined },
    params: {},
    body: {},
    query: {},
    ...overrides,
  } as unknown as ServerRequest;
}

const samplePublish = {
  title: 'My Chart',
  description: 'A bar chart',
  visibility: 'private' as const,
  artifact: {
    type: 'react' as const,
    content: 'export default () => <div>hello</div>;',
    title: 'Chart',
  },
};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  methods = createArtifactAppMethods(mongoose);
  handlers = createArtifactAppHandlers({
    ...methods,
    findAccessibleResources: async () => accessibleIds,
    grantPermission: async (params) => {
      grants.push({
        principalId: String(params.principalId),
        resourceType: params.resourceType,
        resourceId: String(params.resourceId),
        accessRoleId: params.accessRoleId,
      });
      return {};
    },
    recordAuditEntry: async (input) => {
      auditActions.push(input.action);
      return null;
    },
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  grants = [];
  auditActions = [];
  accessibleIds = [];
});

describe('publish', () => {
  test('creates app + version 1, grants owner ACL, and audits', async () => {
    const req = makeReq({ body: samplePublish });
    const res = makeRes();
    await handlers.publish(req, res);

    expect(res.statusCode).toBe(201);
    const body = res.body as { app: { artifactAppId: string; createdBy: string }; version: { versionNumber: number; sourceSnapshot: string; integrity: { sourceHash: string } } };
    expect(body.app.artifactAppId).toMatch(/^app_/);
    expect(body.app.createdBy).toBe('user-1');
    expect(body.version.versionNumber).toBe(1);
    expect(body.version.sourceSnapshot).toBe(samplePublish.artifact.content);
    expect(body.version.integrity.sourceHash).toHaveLength(64);

    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      principalId: 'user-1',
      resourceType: ResourceType.ARTIFACT_APP,
      accessRoleId: AccessRoleIds.ARTIFACT_APP_OWNER,
    });
    expect(auditActions).toContain('artifact_app.created');
  });

  test('ignores createdBy/tenantId supplied in the request body (§8.7)', async () => {
    const req = makeReq({
      body: { ...samplePublish, createdBy: 'attacker', tenantId: 'other-tenant' } as never,
    });
    const res = makeRes();
    await handlers.publish(req, res);

    const body = res.body as { app: { createdBy: string; tenantId?: string } };
    expect(body.app.createdBy).toBe('user-1');
    expect(body.app.tenantId).toBeUndefined();
  });

  test('rejects invalid payloads with 400', async () => {
    const req = makeReq({ body: { title: '' } });
    const res = makeRes();
    await handlers.publish(req, res);
    expect(res.statusCode).toBe(400);
  });

  test('snapshot is independent of later publishes of a mutated artifact', async () => {
    const first = makeRes();
    await handlers.publish(makeReq({ body: samplePublish }), first);
    const firstBody = first.body as { app: { artifactAppId: string } };

    const mutated = {
      ...samplePublish,
      artifact: { ...samplePublish.artifact, content: 'export default () => <div>changed</div>;' },
    };
    const second = makeRes();
    await handlers.publish(makeReq({ body: mutated }), second);

    const stored = await methods.getArtifactVersion({
      artifactAppId: firstBody.app.artifactAppId,
      versionNumber: 1,
    });
    expect(stored?.sourceSnapshot).toBe(samplePublish.artifact.content);
  });
});

describe('get / list', () => {
  test('get returns app with its active version', async () => {
    const created = makeRes();
    await handlers.publish(makeReq({ body: samplePublish }), created);
    const appId = (created.body as { app: { artifactAppId: string } }).app.artifactAppId;

    const res = makeRes();
    await handlers.get(makeReq({ params: { id: appId } as never }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as { app: { artifactAppId: string }; version: { versionNumber: number } | null };
    expect(body.app.artifactAppId).toBe(appId);
    expect(body.version?.versionNumber).toBe(1);
  });

  test('list returns only ACL-accessible apps', async () => {
    const a = makeRes();
    await handlers.publish(makeReq({ body: samplePublish }), a);
    const b = makeRes();
    await handlers.publish(makeReq({ body: { ...samplePublish, title: 'Second' } }), b);

    const resolvedA = await methods.resolveArtifactAppId({
      artifactAppId: (a.body as { app: { artifactAppId: string } }).app.artifactAppId,
    });
    accessibleIds = [resolvedA!._id];

    const res = makeRes();
    await handlers.list(makeReq({}), res);
    const body = res.body as { apps: unknown[] };
    expect(body.apps).toHaveLength(1);
  });

  test('get returns 404 for unknown id', async () => {
    const res = makeRes();
    await handlers.get(makeReq({ params: { id: 'app_missing' } as never }), res);
    expect(res.statusCode).toBe(404);
  });
});

describe('version lifecycle', () => {
  async function publishApp(): Promise<string> {
    const res = makeRes();
    await handlers.publish(makeReq({ body: samplePublish }), res);
    return (res.body as { app: { artifactAppId: string } }).app.artifactAppId;
  }

  test('create → release → activate updates the active version', async () => {
    const appId = await publishApp();

    const createRes = makeRes();
    await handlers.createVersion(
      makeReq({
        params: { id: appId } as never,
        body: { artifact: samplePublish.artifact, changelog: 'v2' },
      }),
      createRes,
    );
    expect(createRes.statusCode).toBe(201);
    const versionId = (createRes.body as { artifactVersionId: string }).artifactVersionId;

    const releaseRes = makeRes();
    await handlers.releaseVersion(
      makeReq({ params: { id: appId, versionId } as never }),
      releaseRes,
    );
    expect((releaseRes.body as { publication: { state: string } }).publication.state).toBe(
      'released',
    );

    const activateRes = makeRes();
    await handlers.activateVersion(
      makeReq({ params: { id: appId, versionId } as never }),
      activateRes,
    );
    expect(activateRes.statusCode).toBe(200);
    expect((activateRes.body as { activeVersionId: string }).activeVersionId).toBe(versionId);
  });

  test('activating an unreleased version returns 409', async () => {
    const appId = await publishApp();
    const createRes = makeRes();
    await handlers.createVersion(
      makeReq({ params: { id: appId } as never, body: { artifact: samplePublish.artifact } }),
      createRes,
    );
    const versionId = (createRes.body as { artifactVersionId: string }).artifactVersionId;

    const res = makeRes();
    await handlers.activateVersion(makeReq({ params: { id: appId, versionId } as never }), res);
    expect(res.statusCode).toBe(409);
  });

  test('released version content is immutable across a re-release', async () => {
    const appId = await publishApp();
    const createRes = makeRes();
    await handlers.createVersion(
      makeReq({ params: { id: appId } as never, body: { artifact: samplePublish.artifact } }),
      createRes,
    );
    const versionId = (createRes.body as { artifactVersionId: string }).artifactVersionId;

    const firstRelease = makeRes();
    await handlers.releaseVersion(makeReq({ params: { id: appId, versionId } as never }), firstRelease);
    const hashAfterFirst = (
      firstRelease.body as { integrity: { sourceHash: string } }
    ).integrity.sourceHash;

    const secondRelease = makeRes();
    await handlers.releaseVersion(makeReq({ params: { id: appId, versionId } as never }), secondRelease);
    const hashAfterSecond = (
      secondRelease.body as { integrity: { sourceHash: string } }
    ).integrity.sourceHash;

    expect(hashAfterSecond).toBe(hashAfterFirst);
  });
});
