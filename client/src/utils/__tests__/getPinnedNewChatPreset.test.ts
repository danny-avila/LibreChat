import { EModelEndpoint } from 'librechat-data-provider';
import type { TModelSpec, TPreset, TStartupConfig } from 'librechat-data-provider';
import { getPinnedNewChatPreset } from '../endpoints';

const list = [
  {
    name: 'fast-chat',
    label: 'Fast Chat',
    default: true,
    preset: { endpoint: EModelEndpoint.openAI, model: 'gpt-fast' },
  },
  {
    name: 'large-chat',
    label: 'Large Chat',
    preset: { endpoint: EModelEndpoint.openAI, model: 'gpt-large' },
  },
] as TModelSpec[];

const config = ({
  prioritize = true,
  enforce = false,
  modelSelect = true,
  specs = list,
}: {
  prioritize?: boolean;
  enforce?: boolean;
  modelSelect?: boolean;
  specs?: TModelSpec[];
} = {}): TStartupConfig =>
  ({
    interface: { modelSelect, presets: true },
    modelSpecs: { prioritize, enforce, list: specs },
  }) as TStartupConfig;

const pinned = (fields: Partial<TPreset> = {}): TPreset =>
  ({
    presetId: 'p1',
    title: 'Pinned',
    defaultPreset: true,
    endpoint: EModelEndpoint.openAI,
    model: 'gpt-large',
    spec: 'large-chat',
    ...fields,
  }) as TPreset;

describe('getPinnedNewChatPreset', () => {
  it('starts from a pinned preset whose spec is still offered, even with specs prioritized', () => {
    expect(getPinnedNewChatPreset(pinned(), config())).toEqual(pinned());
  });

  it('ignores a missing preset and the default spec stored without a presetId', () => {
    expect(getPinnedNewChatPreset(null, config())).toBeUndefined();
    expect(getPinnedNewChatPreset(undefined, config())).toBeUndefined();
    expect(
      getPinnedNewChatPreset(
        {
          endpoint: EModelEndpoint.openAI,
          model: 'gpt-fast',
          spec: 'fast-chat',
        } as TPreset,
        config(),
      ),
    ).toBeUndefined();
  });

  it('leaves new chats to the specs when the pin has no valid spec and specs must be selected', () => {
    const noSpec = pinned({ spec: null });
    const staleSpec = pinned({ spec: 'removed' });
    expect(getPinnedNewChatPreset(noSpec, config())).toBeUndefined();
    expect(getPinnedNewChatPreset(staleSpec, config())).toBeUndefined();
    expect(
      getPinnedNewChatPreset(noSpec, config({ prioritize: false, enforce: true })),
    ).toBeUndefined();
    expect(
      getPinnedNewChatPreset(noSpec, config({ prioritize: false, modelSelect: false })),
    ).toBeUndefined();
  });

  it('starts from any pinned preset when specs are not prioritized, clearing a stale spec', () => {
    const relaxed = config({ prioritize: false });
    expect(getPinnedNewChatPreset(pinned({ spec: null }), relaxed)).toEqual(pinned({ spec: null }));
    expect(getPinnedNewChatPreset(pinned({ spec: 'removed' }), relaxed)).toEqual(
      pinned({ spec: null }),
    );
  });

  it('starts from any pinned preset when no specs are configured', () => {
    expect(getPinnedNewChatPreset(pinned({ spec: null }), config({ specs: [] }))).toEqual(
      pinned({ spec: null }),
    );
    expect(getPinnedNewChatPreset(pinned({ spec: null }), {} as TStartupConfig)).toEqual(
      pinned({ spec: null }),
    );
  });
});
