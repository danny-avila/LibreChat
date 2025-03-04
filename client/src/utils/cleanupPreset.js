import { parseConvo } from 'librechat-data-provider';
const cleanupPreset = ({ preset: _preset }) => {
    const { endpoint, endpointType } = _preset ?? {};
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
    /* @ts-ignore: endpoint can be a custom defined name */
    const parsedPreset = parseConvo({ endpoint, endpointType, conversation: preset });
    return {
        presetId: _preset?.presetId ?? null,
        ...parsedPreset,
        endpoint,
        endpointType,
        title: _preset?.title ?? 'New Preset',
    };
};
export default cleanupPreset;
