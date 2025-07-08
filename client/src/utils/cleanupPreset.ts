import { parseConvo } from 'librechat-data-provider';
import type { TPreset } from 'librechat-data-provider';

type UIPreset = Partial<TPreset> & { presetOverride?: Partial<TPreset> };
type TCleanupPreset = {
  preset?: UIPreset;
};

const cleanupPreset = ({ preset: _preset }: TCleanupPreset): TPreset => {
  const { endpoint, endpointType } = _preset ?? ({} as UIPreset);
  if (endpoint == null || endpoint === '') {
    console.error(`Unknown endpoint ${endpoint}`, _preset);
    return {
      endpoint: null,
      presetId: _preset?.presetId ?? null,
      title: _preset?.title ?? 'New Preset',
    };
  }

  const { presetOverride = {}, ...rest } = _preset ?? {};
  const preset = { ...rest, ...presetOverride };

  // Handle deprecated chatGptLabel field
  // If both chatGptLabel and modelLabel exist, prioritize modelLabel and remove chatGptLabel
  // If only chatGptLabel exists, migrate it to modelLabel
  if (preset.chatGptLabel && preset.modelLabel) {
    // Both exist: prioritize modelLabel, remove chatGptLabel
    delete preset.chatGptLabel;
  } else if (preset.chatGptLabel && !preset.modelLabel) {
    // Only chatGptLabel exists: migrate to modelLabel
    preset.modelLabel = preset.chatGptLabel;
    delete preset.chatGptLabel;
  } else if ('chatGptLabel' in preset) {
    // chatGptLabel exists but is empty/falsy: remove it
    delete preset.chatGptLabel;
  }

  /* @ts-ignore: endpoint can be a custom defined name */
  const parsedPreset = parseConvo({ endpoint, endpointType, conversation: preset });

  return {
    presetId: _preset?.presetId ?? null,
    ...parsedPreset,
    endpoint,
    endpointType,
    title: _preset?.title ?? 'New Preset',
  } as TPreset;
};

export default cleanupPreset;
