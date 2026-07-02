import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { renderHook } from '@testing-library/react';
import { brandConfigSchema } from 'librechat-data-provider';
import type { TStartupConfig, TBrandConfig } from 'librechat-data-provider';
import useBrand from '../useBrand';

let mockStartupConfig: Partial<TStartupConfig> | undefined;
jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: mockStartupConfig }),
}));

function loadBrand(file: string): TBrandConfig {
  const raw = yaml.load(fs.readFileSync(path.resolve(__dirname, '../../brands', file), 'utf8'));
  return brandConfigSchema.parse(raw);
}

afterEach(() => {
  mockStartupConfig = undefined;
});

/** Mirrors the composer's useBrand test for every automation control wired in set A,
 * proving each component reads the correct fields from the real gemini brand file. */
describe('useBrand — automation controls (set A, gemini/sim.yaml)', () => {
  beforeEach(() => {
    mockStartupConfig = { brand: loadBrand('sim.yaml') };
  });

  it('send_button: aria + testid overridden, id kept native (null)', () => {
    const { result } = renderHook(() => useBrand());
    const c = result.current.getControl('send_button');
    expect(c?.aria).toBe('Send message');
    expect(c?.testid).toBe('send-button-container');
    expect(c?.id).toBeNull();
  });

  it('stop_generating: reuses the send button testid (button swaps in place)', () => {
    const { result } = renderHook(() => useBrand());
    const c = result.current.getControl('stop_generating');
    expect(c?.aria).toBe('Stop response');
    expect(c?.testid).toBe('send-button-container');
    expect(c?.id).toBeNull();
  });

  it('model_switcher: aria (with ${modelName}) + testid; label is visible → not wired', () => {
    const { result } = renderHook(() => useBrand());
    const c = result.current.getControl('model_switcher');
    expect(c?.aria).toBe('Open mode picker, currently ${modelName}');
    expect(c?.testid).toBe('bard-mode-menu-button');
  });

  it('model_search: menu container + per-row selectors', () => {
    const { result } = renderHook(() => useBrand());
    const c = result.current.getControl('model_search');
    expect(c?.menu_container_testid).toBe('gem-mode-menu');
    expect(c?.option_row_testid).toBe('bard-mode-option-${modeId}');
    expect(c?.option_row_role).toBe('menuitem');
  });

  it('response_container: classes + tag (no testid)', () => {
    const { result } = renderHook(() => useBrand());
    const c = result.current.getControl('response_container');
    expect(c?.classes).toBe('ng-star-inserted');
    expect(c?.tag).toBe('message-content');
    expect(c?.testid).toBeNull();
  });

  it('response_content: classes', () => {
    const { result } = renderHook(() => useBrand());
    const c = result.current.getControl('response_content');
    expect(c?.classes).toBe('markdown markdown-main-panel');
  });

  it('is a no-op for every control when no brand is active', () => {
    mockStartupConfig = { appTitle: 'LibreChat' };
    const { result } = renderHook(() => useBrand());
    for (const name of [
      'send_button',
      'stop_generating',
      'model_switcher',
      'model_search',
      'response_container',
      'response_content',
    ]) {
      expect(result.current.getControl(name)).toBeNull();
    }
  });
});
