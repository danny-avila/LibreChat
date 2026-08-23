import fs from 'fs';
import path from 'path';
import { ProviderId } from 'librechat-data-provider';
import { providerIcons } from './registry';

const publicAssets = path.resolve(__dirname, '../../../../../client/public');

describe('providerIcons', () => {
  it('has an entry for every ProviderId', () => {
    for (const id of Object.values(ProviderId)) {
      expect(providerIcons[id]).toBeDefined();
      expect(providerIcons[id].label).toBeTruthy();
    }
  });

  it('points every asset entry at a file that exists on disk', () => {
    for (const [id, def] of Object.entries(providerIcons)) {
      if (def.art.kind !== 'asset') {
        continue;
      }
      const onDisk = path.join(publicAssets, def.art.src);
      expect({ id, exists: fs.existsSync(onDisk) }).toEqual({ id, exists: true });
    }
  });

  it('marks raster art as not monochrome', () => {
    for (const def of Object.values(providerIcons)) {
      if (def.art.kind === 'asset' && /\.(png|webp|jpg)$/.test(def.art.src)) {
        expect(def.mono).not.toBe(true);
      }
    }
  });

  it('refines Google by model so Gemini renders its own mark', () => {
    const refined = providerIcons[ProviderId.google].byModel?.('gemini-2.5-pro');
    expect(refined?.art).toBeDefined();
    expect(providerIcons[ProviderId.google].byModel?.('some-other-model')).toBeUndefined();
  });

  it('varies the OpenAI tile color by model generation', () => {
    const gpt4 = providerIcons[ProviderId.openai].byModel?.('gpt-4o');
    const gpt5 = providerIcons[ProviderId.openai].byModel?.('gpt-5.6');
    expect(gpt4?.brandColor).toBe('#AB68FF');
    expect(gpt5?.brandColor).toBe('#000000');
  });
});
