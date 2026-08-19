import { RecoilRoot } from 'recoil';
import * as Popover from '@radix-ui/react-popover';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import type { TPreset } from 'librechat-data-provider';
import PresetItems from '../PresetItems';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: () => ({ data: {} }),
}));

jest.mock('~/hooks/Endpoint/Icons', () => ({
  icons: {},
}));

const preset = {
  presetId: 'preset-1',
  title: 'A preset',
  endpoint: 'openAI',
} as TPreset;

function setup() {
  const clearAllPresets = jest.fn();
  render(
    <RecoilRoot>
      {/* Each row wraps itself in a popover `Close`, which needs the context. */}
      <Popover.Root open={true}>
        <PresetItems
          presets={[preset]}
          onSetDefaultPreset={jest.fn()}
          onSelectPreset={jest.fn()}
          onChangePreset={jest.fn()}
          onDeletePreset={jest.fn()}
          clearAllPresets={clearAllPresets}
          onFileSelected={jest.fn()}
        />
      </Popover.Root>
    </RecoilRoot>,
  );
  return { clearAllPresets };
}

describe('PresetItems clear-all dialog', () => {
  /**
   * The dialog is controlled and has no trigger, and the menu item that opens
   * it sets `hideOnClick: false` so the menu stays open behind it. Focus has to
   * come back to that item, or a keyboard user is left on the document.
   */
  it('returns focus to the invoking menu item when the dialog is dismissed', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: 'com_ui_more_options' }));
    const clearItem = await screen.findByRole('menuitem', { name: 'com_ui_clear_all' });
    await user.click(clearItem);

    const cancel = await screen.findByRole('button', { name: 'com_ui_cancel' });
    await user.click(cancel);

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(clearItem);
    });
  });

  it('clears the presets when the dialog is confirmed', async () => {
    const user = userEvent.setup();
    const { clearAllPresets } = setup();

    await user.click(screen.getByRole('button', { name: 'com_ui_more_options' }));
    await user.click(await screen.findByRole('menuitem', { name: 'com_ui_clear_all' }));
    await user.click(await screen.findByRole('button', { name: 'com_ui_clear' }));

    expect(clearAllPresets).toHaveBeenCalled();
  });
});
