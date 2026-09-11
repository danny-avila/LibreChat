import type { TArtifactApp, TArtifactVersion } from './artifactApps';
import { normalizeArtifactAppDetail, syncArtifactAppSchema } from './artifactApps';

const app = { artifactAppId: 'app-1' } as TArtifactApp;
const version = { artifactVersionId: 'version-1' } as TArtifactVersion;

describe('normalizeArtifactAppDetail', () => {
  it('accepts the backward-compatible app/version envelope', () => {
    expect(normalizeArtifactAppDetail({ app, version })).toEqual({ app, version });
  });

  it('accepts the raw app shape returned by short-lived rollout pods', () => {
    expect(normalizeArtifactAppDetail(app)).toEqual({ app, version: null });
  });
});

describe('syncArtifactAppSchema source identity', () => {
  const request = {
    title: 'Report',
    artifact: { type: 'html', content: '<h1>Report</h1>' },
    source: { conversationId: 'conversation-1' },
  };

  it.each([
    'artifact:v1:identifier:report:text/html',
    'artifact:v1:file:tool-artifact-file-1',
    'identifier:legacy-report:application/vnd.react',
  ])('accepts a versioned or recognized rollout key: %s', (sourceKey) => {
    expect(
      syncArtifactAppSchema.safeParse({
        ...request,
        source: { ...request.source, sourceKey },
      }).success,
    ).toBe(true);
  });

  it('rejects unversioned arbitrary identities', () => {
    expect(
      syncArtifactAppSchema.safeParse({
        ...request,
        source: { ...request.source, sourceKey: 'report:text/html' },
      }).success,
    ).toBe(false);
  });
});
