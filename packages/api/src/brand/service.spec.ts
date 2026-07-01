import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadBrandConfig } from './service';

const CLAUDE_YAML = `brand: claude
deployment_subdomain: ans
deployment_url: ans.example.com
placeholders:
  "\${modelName}": The currently selected model name
controls:
  composer:
    label: null
    placeholder: "Try: draft an email"
    aria: Write your prompt to Claude
    testid: chat-input
    id: null
  response_container:
    classes: group
    attr: "data-is-streaming"
    notes: "Best handle: data-is-streaming attribute"
`;

const INVALID_YAML = `deployment_url: broken.example.com
controls: not-a-map
`;

describe('loadBrandConfig', () => {
  let brandsDir: string;

  beforeAll(() => {
    brandsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brands-'));
    // File named by subdomain, not brand — exercises the brand-field fallback.
    fs.writeFileSync(path.join(brandsDir, 'ans.yaml'), CLAUDE_YAML);
    fs.writeFileSync(path.join(brandsDir, 'bad.yaml'), INVALID_YAML);
  });

  afterAll(() => {
    fs.rmSync(brandsDir, { recursive: true, force: true });
  });

  it('returns null when no brand is selected', () => {
    expect(loadBrandConfig(brandsDir, undefined)).toBeNull();
  });

  it('resolves a brand by its `brand:` field when the filename differs', () => {
    const config = loadBrandConfig(brandsDir, 'claude');
    expect(config).not.toBeNull();
    expect(config?.brand).toBe('claude');
    expect(config?.deployment_subdomain).toBe('ans');
    expect(config?.deployment_url).toBe('ans.example.com');
    expect(config?.placeholders?.['${modelName}']).toBe('The currently selected model name');
  });

  it('preserves known and catchall control fields', () => {
    const config = loadBrandConfig(brandsDir, 'claude');
    expect(config?.controls.composer.testid).toBe('chat-input');
    expect(config?.controls.composer.id).toBeNull();
    // `attr` is not an explicitly-typed field; it survives via the catchall.
    expect(config?.controls.response_container.attr).toBe('data-is-streaming');
  });

  it('returns null for a brand with no matching file', () => {
    expect(loadBrandConfig(brandsDir, 'missing')).toBeNull();
  });

  it('returns null (does not throw) when the config fails validation', () => {
    fs.writeFileSync(path.join(brandsDir, 'grok.yaml'), INVALID_YAML);
    expect(loadBrandConfig(brandsDir, 'grok')).toBeNull();
  });
});
