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
  dictation_button:
    aria: Record
    tag: speech-dictation-mic-button
    notes: "Same element as voice_button"
    data_node_type: speech_dictation_mic_button
`;

const INVALID_YAML = `deployment_url: broken.example.com
controls: not-a-map
`;

const INVALID_MATCHING_YAML = `brand: grok
deployment_url: broken.example.com
controls: not-a-map
`;

describe('loadBrandConfig', () => {
  let brandsDir: string;

  beforeAll(() => {
    brandsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brands-'));
    // File named by subdomain, not brand — resolution matches on the `brand:` field.
    fs.writeFileSync(path.join(brandsDir, 'ans.yaml'), CLAUDE_YAML);
    fs.writeFileSync(path.join(brandsDir, 'bad.yaml'), INVALID_YAML);
  });

  afterAll(() => {
    fs.rmSync(brandsDir, { recursive: true, force: true });
  });

  it('returns null when no brand is selected', () => {
    expect(loadBrandConfig(brandsDir, undefined)).toBeNull();
  });

  it('resolves a brand by its `brand:` field regardless of filename', () => {
    const config = loadBrandConfig(brandsDir, 'claude');
    expect(config).not.toBeNull();
    expect(config?.brand).toBe('claude');
    expect(config?.deployment_subdomain).toBe('ans');
    expect(config?.deployment_url).toBe('ans.example.com');
    expect(config?.placeholders?.['${modelName}']).toBe('The currently selected model name');
  });

  it('preserves core control fields', () => {
    const config = loadBrandConfig(brandsDir, 'claude');
    expect(config?.controls.composer.testid).toBe('chat-input');
    expect(config?.controls.composer.id).toBeNull();
  });

  it('keeps `tag` and `notes` through validation', () => {
    const config = loadBrandConfig(brandsDir, 'claude');
    expect(config?.controls.dictation_button.tag).toBe('speech-dictation-mic-button');
    expect(config?.controls.dictation_button.notes).toBe('Same element as voice_button');
  });

  it('passes through unknown descriptive control fields', () => {
    const config = loadBrandConfig(brandsDir, 'claude');
    // Neither key is in the core schema — `.passthrough()` keeps them at runtime.
    expect(config?.controls.response_container).toMatchObject({ attr: 'data-is-streaming' });
    expect(config?.controls.dictation_button).toMatchObject({
      data_node_type: 'speech_dictation_mic_button',
    });
  });

  it('returns null for a brand with no matching file', () => {
    expect(loadBrandConfig(brandsDir, 'missing')).toBeNull();
  });

  it('returns null (does not throw) when the matched config fails validation', () => {
    fs.writeFileSync(path.join(brandsDir, 'llm.yaml'), INVALID_MATCHING_YAML);
    expect(loadBrandConfig(brandsDir, 'grok')).toBeNull();
  });
});
