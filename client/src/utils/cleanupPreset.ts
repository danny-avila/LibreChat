import { parseConvo } from 'librechat-data-provider';
import type { TPreset } from 'librechat-data-provider';

type TCleanupPreset = {
  preset: Partial<TPreset>;
};

const cleanupPreset = ({ preset: _preset }: TCleanupPreset): TPreset => {
  const { endpoint, endpointType } = _preset;
  if (!endpoint) {
    console.error(`Unknown endpoint ${endpoint}`, _preset);
    return {
      endpoint: null,
      presetId: _preset?.presetId ?? null,
      title: _preset?.title ?? 'New Preset',
    };
  }

  const parsedPreset = parseConvo({ endpoint, endpointType, conversation: _preset });

  return {
    presetId: _preset?.presetId ?? null,
    ...parsedPreset,
    endpoint,
    endpointType,
    title: _preset?.title ?? 'New Preset',
  } as TPreset;
};

export default cleanupPreset;
