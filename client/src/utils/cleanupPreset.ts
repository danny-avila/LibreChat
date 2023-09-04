import { parseConvo } from 'librechat-data-provider';
import type { TEndpointsConfig, TPreset } from 'librechat-data-provider';

type TCleanupPreset = {
  preset: Partial<TPreset>;
  endpointsConfig: TEndpointsConfig;
};

const cleanupPreset = ({ preset: _preset }: TCleanupPreset): TPreset => {
  const { endpoint } = _preset;
  if (!endpoint) {
    console.error(`Unknown endpoint ${endpoint}`);
    return {
      endpoint: null,
      presetId: _preset?.presetId ?? null,
      title: _preset?.title ?? 'New Preset',
    };
  }

  const parsedPreset = parseConvo(endpoint, _preset);

  return {
    endpoint,
    presetId: _preset?.presetId ?? null,
    ...parsedPreset,
    title: _preset?.title ?? 'New Preset',
  } as TPreset;
};

export default cleanupPreset;
