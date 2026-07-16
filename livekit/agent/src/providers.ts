import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import * as openai from '@livekit/agents-plugin-openai';

import type { stt, tts } from '@livekit/agents';
import type { TTSVoices } from '@livekit/agents-plugin-openai';

export interface SttSelection {
  provider: string;
  model?: string;
  language?: string;
}

export interface TtsSelection {
  provider: string;
  model?: string;
  voice?: string;
}

/**
 * Providers resolve by name rather than a fixed enum, so operators can add one without a
 * schema change and no vendor is hardcoded into the design.
 *
 * LiveKit Inference (`inference.STT`/`inference.TTS`) is Cloud-only despite what the
 * upstream quickstarts imply, so self-hosted deployments must supply their own keys.
 *
 * Each plugin names its voice option differently — cartesia takes a voice id string,
 * elevenlabs a `voiceId`, openai a closed union — so the adapters are per-provider rather
 * than one generic spread.
 */
const STT_REGISTRY: Record<string, (selection: SttSelection) => stt.STT> = {
  deepgram: ({ model, language }) =>
    new deepgram.STT({ ...(model && { model }), ...(language && { language }) }),
  cartesia: ({ model, language }) =>
    new cartesia.STT({ ...(model && { model }), ...(language && { language }) }),
  openai: ({ model, language }) =>
    new openai.STT({ ...(model && { model }), ...(language && { language }) }),
};

const TTS_REGISTRY: Record<string, (selection: TtsSelection) => tts.TTS> = {
  cartesia: ({ model, voice }) =>
    new cartesia.TTS({ ...(model && { model }), ...(voice && { voice }) }),
  elevenlabs: ({ model, voice }) =>
    new elevenlabs.TTS({ ...(model && { model }), ...(voice && { voiceId: voice }) }),
  deepgram: ({ model }) => new deepgram.TTS({ ...(model && { model }) }),
  openai: ({ model, voice }) =>
    new openai.TTS({ ...(model && { model }), ...(voice && { voice: voice as TTSVoices }) }),
};

const resolve = <T, S extends { provider: string }>(
  registry: Record<string, (selection: S) => T>,
  selection: S,
  kind: string,
): T => {
  const factory = registry[selection.provider];
  if (!factory) {
    throw new Error(
      `[livekit-agent] unknown ${kind} provider "${selection.provider}". Available: ${Object.keys(registry).join(', ')}`,
    );
  }
  return factory(selection);
};

export const createStt = (selection: SttSelection): stt.STT =>
  resolve(STT_REGISTRY, selection, 'STT');

export const createTts = (selection: TtsSelection): tts.TTS =>
  resolve(TTS_REGISTRY, selection, 'TTS');

export const sttProviders = (): string[] => Object.keys(STT_REGISTRY);
export const ttsProviders = (): string[] => Object.keys(TTS_REGISTRY);
