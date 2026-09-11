import type { TArtifactApp, TArtifactVersion } from './artifactApps';
import { normalizeArtifactAppDetail } from './artifactApps';

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
