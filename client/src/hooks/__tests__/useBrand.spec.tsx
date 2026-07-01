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

/** Load a real brand file from client/src/brands and validate it with the real schema. */
function loadBrand(file: string): TBrandConfig {
  const raw = yaml.load(fs.readFileSync(path.resolve(__dirname, '../../brands', file), 'utf8'));
  return brandConfigSchema.parse(raw);
}

afterEach(() => {
  mockStartupConfig = undefined;
});

describe('useBrand', () => {
  it('is a no-op when no brand is active', () => {
    mockStartupConfig = { appTitle: 'LibreChat' };
    const { result } = renderHook(() => useBrand());
    expect(result.current.brand).toBeNull();
    expect(result.current.isBranded).toBe(false);
    expect(result.current.getControl('composer')).toBeNull();
  });

  it('exposes the gemini composer control from the real brand file', () => {
    mockStartupConfig = { brand: loadBrand('sim.yaml') };
    const { result } = renderHook(() => useBrand());
    expect(result.current.isBranded).toBe(true);
    expect(result.current.brand?.brand).toBe('gemini');
    const composer = result.current.getControl('composer');
    expect(composer?.placeholder).toBe('Ask Gemini');
    expect(composer?.aria).toBe('Enter a prompt for Gemini');
    expect(composer?.testid).toBeNull();
    expect(composer?.id).toBeNull();
  });

  it('exposes the chatgpt composer control from the real brand file', () => {
    mockStartupConfig = { brand: loadBrand('chat.yaml') };
    const { result } = renderHook(() => useBrand());
    expect(result.current.brand?.brand).toBe('chatgpt');
    const composer = result.current.getControl('composer');
    expect(composer?.placeholder).toBe('Ask anything');
    expect(composer?.aria).toBe('Chat with ChatGPT');
    expect(composer?.testid).toBeNull();
    expect(composer?.id).toBe('prompt-textarea');
  });

  it('returns null for a control the brand does not define', () => {
    mockStartupConfig = { brand: loadBrand('sim.yaml') };
    const { result } = renderHook(() => useBrand());
    expect(result.current.getControl('does_not_exist')).toBeNull();
  });
});
