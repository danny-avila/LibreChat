import { render } from '@testing-library/react';
import SharePointPickerDialog from '../SharePointPickerDialog';

/**
 * The picker used to render an overlay of its own, beside the one
 * `OGDialogContent` portals anyway, asking for a lighter black backdrop. Both
 * sat at the same depth, so the primitive's — mounted second — painted over it
 * and the requested color never reached the screen. The dialog itself is
 * opaque, so it needs no backdrop of its own: it scrims with the theme's
 * overlay role like every other OGDialog, and exactly once.
 */

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useSharePointPicker: () => ({
    openSharePointPicker: jest.fn(),
    closeSharePointPicker: jest.fn(),
    cleanup: jest.fn(),
  }),
}));

/** The overlay is the only full-bleed layer while no download is in flight. */
const scrims = () => Array.from(document.querySelectorAll<HTMLElement>('div.inset-0'));

describe('SharePoint picker dialog', () => {
  it('paints the app scrim once, and none of its own', () => {
    render(<SharePointPickerDialog isOpen={true} onOpenChange={jest.fn()} />);

    const [scrim, ...extra] = scrims();
    expect(extra).toEqual([]);
    expect(scrim).toHaveClass('bg-surface-overlay/80');
    expect(scrim.className).not.toContain('bg-black');
  });

  it('paints no backdrop while closed', () => {
    render(<SharePointPickerDialog isOpen={false} onOpenChange={jest.fn()} />);

    expect(scrims()).toEqual([]);
  });
});
