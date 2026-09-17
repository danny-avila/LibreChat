import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OGDialog, OGDialogContent, OGDialogTitle } from './OriginalDialog';
import ControlCombobox from './ControlCombobox';

type CapturedObserver = {
  callback: ResizeObserverCallback;
  target: Element | null;
  disconnect: jest.Mock;
};

const observers: CapturedObserver[] = [];

class CapturingResizeObserver {
  callback: ResizeObserverCallback;
  target: Element | null = null;
  disconnect = jest.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }

  observe(target: Element) {
    this.target = target;
  }

  unobserve = jest.fn();
}

const originalResizeObserver = window.ResizeObserver;

beforeEach(() => {
  observers.length = 0;
  (window as unknown as { ResizeObserver: typeof CapturingResizeObserver }).ResizeObserver =
    CapturingResizeObserver;
});

afterEach(() => {
  (window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    originalResizeObserver;
});

const items = [
  { label: 'Option A', value: 'a' },
  { label: 'Option B', value: 'b' },
];

const renderCombobox = (initialButtonWidth: number, isCollapsed = false) => {
  const offsetWidthSpy = jest
    .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
    .mockReturnValue(initialButtonWidth);

  const utils = render(
    <ControlCombobox
      selectedValue="a"
      displayValue="Option A"
      items={items}
      setValue={() => undefined}
      ariaLabel="Test combobox"
      isCollapsed={isCollapsed}
      showCarat
    />,
  );

  return { ...utils, offsetWidthSpy };
};

const getPopoverWidth = () => {
  const popover = document.querySelector('.animate-popover') as HTMLElement | null;
  return popover?.style.width ?? null;
};

const openPopover = () => {
  const trigger = screen.getByRole('combobox');
  act(() => {
    trigger.click();
  });
};

describe('ControlCombobox popover sizing', () => {
  it('shows a restored unavailable entry without allowing selection', async () => {
    const selected = jest.fn();
    render(
      <ControlCombobox
        selectedValue="missing"
        items={[...items, { label: 'Unavailable provider', value: 'missing', disabled: true }]}
        setValue={selected}
        ariaLabel="Providers"
        searchPlaceholder="Search providers"
        isCollapsed={false}
      />,
    );
    await act(async () => {
      await userEvent.click(screen.getByRole('combobox', { name: 'Providers' }));
    });
    const unavailable = await screen.findByRole('option', { name: 'Unavailable provider' });
    expect(unavailable).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(unavailable);
    expect(selected).not.toHaveBeenCalledWith('missing');
    await act(async () => {
      await userEvent.click(screen.getByRole('option', { name: 'Option B' }));
    });
    expect(selected).toHaveBeenCalledWith('b');
  });
  it('uses the button width measured on mount when layout is stable', () => {
    renderCombobox(275);
    openPopover();
    expect(getPopoverWidth()).toBe('275px');
  });

  it('updates the popover width when the trigger resizes after mount (regression: agent select dropdown rendering at narrow width)', () => {
    const { offsetWidthSpy } = renderCombobox(26);
    openPopover();
    expect(getPopoverWidth()).toBe('26px');

    const observer = observers[0];
    expect(observer).toBeDefined();
    expect(observer.target).not.toBeNull();

    offsetWidthSpy.mockReturnValue(275);

    act(() => {
      observer.callback(
        [
          {
            target: observer.target as Element,
            contentRect: { width: 275 } as DOMRectReadOnly,
            borderBoxSize: [{ inlineSize: 275, blockSize: 36 }],
            contentBoxSize: [{ inlineSize: 275, blockSize: 36 }],
            devicePixelContentBoxSize: [{ inlineSize: 275, blockSize: 36 }],
          } as unknown as ResizeObserverEntry,
        ],
        observer as unknown as ResizeObserver,
      );
    });

    expect(getPopoverWidth()).toBe('275px');
  });

  it('disconnects the ResizeObserver on unmount', () => {
    const { unmount } = renderCombobox(275);
    openPopover();
    const observer = observers[0];
    expect(observer).toBeDefined();
    unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  it('does not observe the trigger button when isCollapsed is true', () => {
    renderCombobox(275, true);
    const triggerObservers = observers.filter(
      (o) => (o.target as HTMLElement | null)?.tagName === 'BUTTON',
    );
    expect(triggerObservers).toHaveLength(0);
  });

  it('falls back to synchronous offsetWidth when ResizeObserver is unavailable', () => {
    (window as unknown as { ResizeObserver: typeof ResizeObserver | undefined }).ResizeObserver =
      undefined;

    renderCombobox(275);
    openPopover();

    expect(getPopoverWidth()).toBe('275px');
    const triggerObservers = observers.filter(
      (o) => (o.target as HTMLElement | null)?.tagName === 'BUTTON',
    );
    expect(triggerObservers).toHaveLength(0);
  });

  it('uses button.offsetWidth when borderBoxSize is unavailable', () => {
    const { offsetWidthSpy } = renderCombobox(26);
    openPopover();
    expect(getPopoverWidth()).toBe('26px');

    const observer = observers[0];
    expect(observer).toBeDefined();

    offsetWidthSpy.mockReturnValue(275);

    act(() => {
      observer.callback(
        [
          {
            target: observer.target as Element,
            contentRect: { width: 251 } as DOMRectReadOnly,
            borderBoxSize: undefined,
            contentBoxSize: undefined,
            devicePixelContentBoxSize: undefined,
          } as unknown as ResizeObserverEntry,
        ],
        observer as unknown as ResizeObserver,
      );
    });

    expect(getPopoverWidth()).toBe('275px');
  });

  it('ignores zero-width resize entries', () => {
    renderCombobox(275);
    openPopover();
    expect(getPopoverWidth()).toBe('275px');

    const observer = observers[0];
    expect(observer).toBeDefined();

    act(() => {
      observer.callback(
        [
          {
            target: observer.target as Element,
            contentRect: { width: 0 } as DOMRectReadOnly,
            borderBoxSize: [{ inlineSize: 0, blockSize: 0 }],
            contentBoxSize: [{ inlineSize: 0, blockSize: 0 }],
            devicePixelContentBoxSize: [{ inlineSize: 0, blockSize: 0 }],
          } as unknown as ResizeObserverEntry,
        ],
        observer as unknown as ResizeObserver,
      );
    });

    expect(getPopoverWidth()).toBe('275px');
  });

  it('filters listed options when the search field is typed in', () => {
    render(
      <ControlCombobox
        selectedValue="a"
        displayValue="Option A"
        items={items}
        setValue={() => undefined}
        ariaLabel="Test combobox"
        searchPlaceholder="Search projects"
        isCollapsed={false}
        showCarat
      />,
    );
    openPopover();

    const search = screen.getByPlaceholderText('Search projects');
    fireEvent.change(search, { target: { value: 'Option B' } });

    expect(screen.getByRole('option', { name: 'Option B' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Option A' })).not.toBeInTheDocument();
  });
});

describe('ControlCombobox portal placement', () => {
  const renderInDialog = (portal: boolean) =>
    render(
      <OGDialog open>
        <OGDialogContent>
          <OGDialogTitle>Change project</OGDialogTitle>
          <ControlCombobox
            selectedValue="a"
            displayValue="Option A"
            items={items}
            setValue={() => undefined}
            ariaLabel="Test combobox"
            searchPlaceholder="Search projects"
            isCollapsed={false}
            showCarat
            portal={portal}
          />
        </OGDialogContent>
      </OGDialog>,
    );

  it('portals to the document by default so existing dialogs keep their current placement', () => {
    renderInDialog(true);
    openPopover();

    const dialog = screen.getByRole('dialog', { name: 'Change project' });
    expect(dialog.contains(screen.getByPlaceholderText('Search projects'))).toBe(false);
  });

  it('keeps the popover inside the dialog when portal is false, so its search field stays typeable', () => {
    renderInDialog(false);
    openPopover();

    const dialog = screen.getByRole('dialog', { name: 'Change project' });
    const search = screen.getByPlaceholderText('Search projects');
    expect(dialog.contains(search)).toBe(true);

    fireEvent.change(search, { target: { value: 'Option B' } });
    expect(screen.getByRole('option', { name: 'Option B' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Option A' })).not.toBeInTheDocument();
  });

  it.each(['select', 'dismiss'] as const)(
    'closes only the nested dialog on Escape after using the combobox to %s',
    async (action) => {
      function Settings() {
        const [value, setValue] = useState('a');
        return (
          <OGDialog defaultOpen>
            <OGDialogContent aria-describedby={undefined}>
              <OGDialogTitle>Outer dialog</OGDialogTitle>
              <OGDialog defaultOpen>
                <OGDialogContent aria-describedby={undefined}>
                  <OGDialogTitle>Settings</OGDialogTitle>
                  <ControlCombobox
                    selectedValue={value}
                    displayValue={items.find((item) => item.value === value)?.label}
                    items={items}
                    setValue={setValue}
                    ariaLabel="Provider"
                    isCollapsed={false}
                    portal={false}
                  />
                </OGDialogContent>
              </OGDialog>
            </OGDialogContent>
          </OGDialog>
        );
      }
      render(<Settings />);
      const user = userEvent.setup();
      const provider = screen.getByRole('combobox', { name: 'Provider' });
      await act(async () => user.click(provider));
      await screen.findByRole('option', { name: 'Option B' });
      if (action === 'select') {
        await act(async () => user.click(screen.getByRole('option', { name: 'Option B' })));
        expect(provider).toHaveTextContent('Option B');
      } else {
        await act(async () => user.keyboard('{Escape}'));
      }
      await waitFor(() => expect(provider).toHaveAttribute('aria-expanded', 'false'));
      expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible();
      act(() => provider.focus());

      await act(async () => user.keyboard('{Escape}'));
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument(),
      );
      expect(screen.getByRole('dialog', { name: 'Outer dialog' })).toBeVisible();
    },
  );
});
