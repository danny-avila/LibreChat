import type { ToolWithMeta } from '../apps';
import { isToolHiddenFromApp, isToolHiddenFromModel } from '../apps';

const tool = (visibility?: unknown): ToolWithMeta =>
  ({
    name: 'do_thing',
    ...(visibility === undefined ? {} : { _meta: { ui: { visibility } } }),
  }) as ToolWithMeta;

describe('tool visibility', () => {
  describe('isToolHiddenFromApp', () => {
    it('treats an absent visibility field as both scopes (not hidden)', () => {
      expect(isToolHiddenFromApp(tool())).toBe(false);
    });

    it('does not hide tools whose explicit visibility includes app', () => {
      expect(isToolHiddenFromApp(tool(['app']))).toBe(false);
      expect(isToolHiddenFromApp(tool(['model', 'app']))).toBe(false);
      expect(isToolHiddenFromApp(tool(['app', 'internal']))).toBe(false);
    });

    it('hides tools whose explicit visibility omits app, including empty/future arrays', () => {
      expect(isToolHiddenFromApp(tool(['model']))).toBe(true);
      expect(isToolHiddenFromApp(tool([]))).toBe(true);
      expect(isToolHiddenFromApp(tool(['model', 'internal']))).toBe(true);
    });
  });

  describe('isToolHiddenFromModel', () => {
    it('treats an absent visibility field as both scopes (not hidden)', () => {
      expect(isToolHiddenFromModel(tool())).toBe(false);
    });

    it('does not hide tools whose explicit visibility includes model', () => {
      expect(isToolHiddenFromModel(tool(['model']))).toBe(false);
      expect(isToolHiddenFromModel(tool(['model', 'app']))).toBe(false);
      expect(isToolHiddenFromModel(tool(['model', 'internal']))).toBe(false);
    });

    it('hides tools whose explicit visibility omits model, including empty/future arrays', () => {
      expect(isToolHiddenFromModel(tool(['app']))).toBe(true);
      expect(isToolHiddenFromModel(tool([]))).toBe(true);
      expect(isToolHiddenFromModel(tool(['app', 'internal']))).toBe(true);
    });
  });
});
