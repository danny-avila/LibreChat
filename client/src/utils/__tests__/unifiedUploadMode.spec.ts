import { isUnifiedUploadMode } from '../files';

describe('isUnifiedUploadMode', () => {
  it('withholds unified mode until the file config resolves', () => {
    /* An unresolved config falls back to the built-in defaults, where the absent
     * legacyFileUploadUX reads as unified. Trusting it shows the unified uploader on a
     * legacy deployment, and an upload made in that window carries no tool resource
     * while the server still applies legacy rules. */
    expect(isUnifiedUploadMode(undefined, true)).toBe(false);
    expect(isUnifiedUploadMode({}, true)).toBe(false);
    expect(isUnifiedUploadMode({ legacyFileUploadUX: false }, true)).toBe(false);
  });

  it('is unified once the config lands and does not opt out', () => {
    expect(isUnifiedUploadMode({}, false)).toBe(true);
    expect(isUnifiedUploadMode({ legacyFileUploadUX: false }, false)).toBe(true);
    expect(isUnifiedUploadMode(undefined, false)).toBe(true);
  });

  it('honors an explicit legacy opt-out', () => {
    expect(isUnifiedUploadMode({ legacyFileUploadUX: true }, false)).toBe(false);
  });
});
