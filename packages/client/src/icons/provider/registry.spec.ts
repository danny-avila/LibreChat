import fs from 'fs';
import path from 'path';
import { ProviderId } from 'librechat-data-provider';
import { getProviderIconDef, providerIcons } from './registry';

const packageAssets = path.resolve(__dirname, 'assets');

const packagedAssetFiles = [
  'anyscale.png',
  'apipie.png',
  'cohere.png',
  'deepseek.svg',
  'fireworks.png',
  'groq.png',
  'helicone.svg',
  'huggingface.svg',
  'mistral.png',
  'mlx.png',
  'ollama.png',
  'openrouter.png',
  'perplexity.png',
  'qwen.svg',
  'shuttleai.png',
  'together.png',
  'unify.webp',
];

describe('providerIcons', () => {
  it('has an entry for every ProviderId', () => {
    for (const id of Object.values(ProviderId)) {
      expect(providerIcons[id]).toBeDefined();
      expect(providerIcons[id].label).toBeTruthy();
    }
  });

  it('points every asset entry at a file shipped with the package', () => {
    for (const fileName of packagedAssetFiles) {
      expect(fs.existsSync(path.join(packageAssets, fileName))).toBe(true);
    }
    for (const def of Object.values(providerIcons)) {
      if (def.art.kind === 'asset') {
        expect(def.art.src).toBeTruthy();
      }
    }
  });

  it('marks raster art as not monochrome', () => {
    for (const def of Object.values(providerIcons)) {
      if (def.art.kind === 'asset') {
        expect(def.mono).not.toBe(true);
      }
    }
  });

  it('does not attach landing padding to every Cohere icon', () => {
    expect(providerIcons[ProviderId.cohere].className).toBeUndefined();
  });

  it('refines Google by model so Gemini and Gemma keep distinct labels', () => {
    expect(getProviderIconDef(ProviderId.google, 'gemini-2.5-pro').label).toBe('Gemini');
    expect(getProviderIconDef(ProviderId.google, 'gemma-3-27b').label).toBe('Gemma');
    expect(getProviderIconDef(ProviderId.google, 'some-other-model').label).toBe('Google');
  });

  it('varies the OpenAI tile color by model generation', () => {
    const gpt4 = getProviderIconDef(ProviderId.openai, 'gpt-4o');
    const gpt5 = getProviderIconDef(ProviderId.openai, 'gpt-5.6');
    expect(gpt4.brandColor).toBe('var(--provider-openai-gpt4, #AB68FF)');
    expect(gpt5.brandColor).toBe('var(--provider-openai-reasoning, #000000)');
  });
});
