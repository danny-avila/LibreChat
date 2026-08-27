import {
  resolveSpecToolFlag,
  resolveSpecMcpServers,
  resolveSpecUserToggles,
  resolveSpecSkillsEnabled,
} from './models';

/**
 * A model spec's tool configuration seeds the chat badge row; it does not
 * override what the user then sends back. See #15277 — every one of these
 * cases held before the fix except the "spec on, user off" rows.
 */
describe('model spec defaults vs. explicit user toggles', () => {
  describe('resolveSpecToolFlag', () => {
    it.each([
      ['spec on, user off', false, true, false],
      ['spec on, user on', true, true, true],
      ['spec on, user silent', undefined, true, true],
      ['spec off, user on', true, false, true],
      ['spec off, user off', false, false, false],
      ['spec off, user silent', undefined, false, false],
      ['spec absent, user on', true, undefined, true],
      ['spec absent, user silent', undefined, undefined, false],
    ])('%s', (_label, userValue, specValue, expected) => {
      expect(resolveSpecToolFlag(userValue, specValue)).toBe(expected);
    });
  });

  describe('resolveSpecMcpServers', () => {
    it('treats a cleared selection as a deselection, not an absent value', () => {
      expect(resolveSpecMcpServers([], ['crm'])).toEqual([]);
    });

    it('replaces the spec list with the selection rather than unioning them', () => {
      expect(resolveSpecMcpServers(['jira'], ['crm'])).toEqual(['jira']);
    });

    it('falls back to the spec list when no selection accompanies the request', () => {
      expect(resolveSpecMcpServers(undefined, ['crm'])).toEqual(['crm']);
    });

    it('yields an empty list when neither side names a server', () => {
      expect(resolveSpecMcpServers(undefined, undefined)).toEqual([]);
    });
  });

  describe('resolveSpecSkillsEnabled', () => {
    it.each([
      ['spec true, user off', false, true, false],
      ['spec true, user silent', undefined, true, true],
      ['allowlist, user off', false, ['research'], false],
      ['allowlist, user silent', undefined, ['research'], true],
      ['spec absent, user on', true, undefined, true],
      ['spec absent, user silent', undefined, undefined, false],
    ])('%s', (_label, userValue, specValue, expected) => {
      expect(resolveSpecSkillsEnabled(userValue, specValue as boolean | string[] | undefined)).toBe(
        expected,
      );
    });

    it('keeps `skills: false` a hard opt-out the badge cannot lift', () => {
      expect(resolveSpecSkillsEnabled(true, false)).toBe(false);
      expect(resolveSpecSkillsEnabled(undefined, false)).toBe(false);
    });
  });

  describe('resolveSpecUserToggles', () => {
    it('drops request toggles for a spec that hides the badge row', () => {
      expect(resolveSpecUserToggles({ web_search: false }, { hideBadgeRow: true })).toBeUndefined();
      expect(resolveSpecUserToggles(false, { hideBadgeRow: true })).toBeUndefined();
    });

    it('passes toggles through for every ordinary spec', () => {
      const toggles = { web_search: false };
      expect(resolveSpecUserToggles(toggles, { hideBadgeRow: false })).toBe(toggles);
      expect(resolveSpecUserToggles(toggles, {})).toBe(toggles);
      expect(resolveSpecUserToggles(toggles, null)).toBe(toggles);
      expect(resolveSpecUserToggles(toggles, undefined)).toBe(toggles);
    });
  });
});
