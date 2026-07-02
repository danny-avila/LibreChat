import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { render, cleanup } from '@testing-library/react';
import { brandConfigSchema } from 'librechat-data-provider';
import type { TBrandConfig } from 'librechat-data-provider';
import BrandTheme from '../BrandTheme';

let mockBrand: TBrandConfig | null = null;
jest.mock('~/hooks', () => ({
  useBrand: () => ({ brand: mockBrand }),
}));

/** Load a real brand file from client/src/brands and validate it with the real schema. */
function loadBrand(file: string): TBrandConfig {
  const raw = yaml.load(fs.readFileSync(path.resolve(__dirname, '../../../brands', file), 'utf8'));
  return brandConfigSchema.parse(raw);
}

afterEach(() => {
  cleanup();
  mockBrand = null;
  document.documentElement.removeAttribute('data-brand');
});

describe('BrandTheme', () => {
  it('sets no data-brand attribute when no brand is active', () => {
    mockBrand = null;
    render(<BrandTheme />);
    expect(document.documentElement.hasAttribute('data-brand')).toBe(false);
  });

  it('mirrors the active brand name onto <html data-brand>', () => {
    mockBrand = loadBrand('sim.yaml');
    render(<BrandTheme />);
    expect(document.documentElement.getAttribute('data-brand')).toBe('gemini');
  });

  it('applies the chatgpt brand from the real brand file', () => {
    mockBrand = loadBrand('chat.yaml');
    render(<BrandTheme />);
    expect(document.documentElement.getAttribute('data-brand')).toBe('chatgpt');
  });

  it('removes the attribute on unmount so the DOM returns to native', () => {
    mockBrand = loadBrand('ans.yaml');
    const { unmount } = render(<BrandTheme />);
    expect(document.documentElement.getAttribute('data-brand')).toBe('claude');
    unmount();
    expect(document.documentElement.hasAttribute('data-brand')).toBe(false);
  });
});
