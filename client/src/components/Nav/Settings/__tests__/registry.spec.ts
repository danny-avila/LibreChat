import { isValidElementType } from 'react-is';
import type { SettingsContextValue } from '../types';
import en from '~/locales/en/translation.json';
import { registry } from '../registry';
import { TABS } from '../types';

const validTabSections = new Map(TABS.map((t) => [t.id, new Set(t.sections.map((s) => s.id))]));

const settingsContext: SettingsContextValue = {
  balanceEnabled: false,
  hasAnyPersonalizationFeature: false,
  hasMemoryOptOut: false,
  hasRemoteAgents: false,
  hasUserProvidedEndpoints: false,
  hasMultiConvo: false,
  hasPrompts: false,
  isLocalProvider: true,
  twoFactorEnabled: false,
  allowAccountDeletion: true,
  aboutEnabled: false,
  engineTTS: 'browser',
  isAdmin: false,
  langfuseFanoutEnabled: false,
};

describe('settings registry', () => {
  it('has unique ids', () => {
    const ids = registry.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('references a valid tab and section for every entry', () => {
    for (const entry of registry) {
      const sections = validTabSections.get(entry.tab);
      expect(sections).toBeDefined();
      expect(sections!.has(entry.section)).toBe(true);
    }
  });

  it('uses label keys that exist in the English locale', () => {
    for (const entry of registry) {
      expect(en).toHaveProperty(entry.labelKey);
    }
  });

  it('has a renderable Component for every entry', () => {
    for (const entry of registry) {
      expect(isValidElementType(entry.Component)).toBe(true);
    }
  });

  describe('Langfuse connection visibility', () => {
    const langfuseEntry = registry.find((entry) => entry.id === 'langfuseConnection');

    it('shows the connection to admins when fanout is enabled', () => {
      expect(
        langfuseEntry?.show?.({
          ...settingsContext,
          isAdmin: true,
          langfuseFanoutEnabled: true,
        }),
      ).toBe(true);
    });

    it('hides the connection from non-admins when fanout is enabled', () => {
      expect(
        langfuseEntry?.show?.({
          ...settingsContext,
          isAdmin: false,
          langfuseFanoutEnabled: true,
        }),
      ).toBe(false);
    });

    it('hides the connection from admins when fanout is disabled', () => {
      expect(
        langfuseEntry?.show?.({
          ...settingsContext,
          isAdmin: true,
          langfuseFanoutEnabled: false,
        }),
      ).toBe(false);
    });
  });
});
