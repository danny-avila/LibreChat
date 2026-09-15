import React, { StrictMode, useState } from 'react';
import { OverlayBack } from '@librechat/client';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createBrowserRouter, RouterProvider, useLocation, useNavigate } from 'react-router-dom';
import { replaceBrowserUrl } from '~/utils/overlays';
import Overlays from './Overlays';

let mockIsMobile = true;
jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useMediaQuery: () => mockIsMobile,
}));

function Windows({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [nested, setNested] = useState(initialOpen);
  const [refuseClose, setRefuseClose] = useState(false);
  const [draft, setDraft] = useState('original');
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="route">{location.pathname}</output>
      <input aria-label="draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button onClick={() => setOpen(true)}>{'Open'}</button>
      <button onClick={() => setOpen(false)}>{'Close'}</button>
      <button onClick={() => setRefuseClose((value) => !value)}>{'Toggle refusal'}</button>
      <button
        onClick={() => {
          setOpen(false);
          void navigate('/c/next');
        }}
      >
        {'Navigate'}
      </button>
      <button
        onClick={() => {
          setOpen(false);
          void navigate('/c/next', { replace: true });
        }}
      >
        {'Replace'}
      </button>
      <button onClick={() => replaceBrowserUrl('/c/stream-123?model=example')}>
        {'Promote URL'}
      </button>
      <OverlayBack
        open={open}
        onClose={() => {
          if (!refuseClose) setOpen(false);
        }}
      >
        {open && (
          <div role="dialog" aria-label="outer">
            <button onClick={() => setNested(true)}>{'Open nested'}</button>
            <button onClick={() => setNested(false)}>{'Close nested'}</button>
            <OverlayBack open={nested} onClose={() => setNested(false)}>
              {nested && <div role="dialog" aria-label="inner" />}
            </OverlayBack>
          </div>
        )}
      </OverlayBack>
    </>
  );
}

describe('mobile overlay history', () => {
  let router: ReturnType<typeof createBrowserRouter>;

  function mount(initialOpen = false) {
    window.history.replaceState({ key: 'before', idx: 0 }, '', '/before');
    window.history.pushState({ key: 'chat', idx: 1, usr: { preserved: true } }, '', '/c/chat');
    router = createBrowserRouter([
      {
        element: <Overlays />,
        children: [{ path: '*', element: <Windows initialOpen={initialOpen} /> }],
      },
    ]);
    return render(
      <StrictMode>
        <RouterProvider router={router} useTransitions={false} />
      </StrictMode>,
    );
  }

  async function open() {
    fireEvent.click(screen.getByText('Open', { selector: 'button' }));
    await waitFor(() => expect(window.history.state.librechatOverlay?.kind).toBe('open'));
  }

  async function back() {
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }

  beforeEach(() => {
    mockIsMobile = true;
  });
  afterEach(() => {
    router?.dispose();
  });

  it('closes the overlay before navigating, preserving URL, draft and router state', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('draft'), { target: { value: 'unsaved words' } });
    await open();
    await back();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(window.history.state.librechatOverlay?.kind).toBe('closed'));
    expect(window.location.pathname).toBe('/c/chat');
    expect(window.history.state.usr).toEqual({ preserved: true });
    expect(screen.getByLabelText('draft')).toHaveValue('unsaved words');
    await back();
    await waitFor(() => expect(window.location.pathname).toBe('/before'));
  });

  it('consumes the entry on explicit close without adding a dead back step', async () => {
    mount();
    await open();
    fireEvent.click(screen.getByText('Close', { selector: 'button' }));
    await waitFor(() => expect(window.history.state.librechatOverlay?.kind).toBe('closed'));
    await back();
    await waitFor(() => expect(window.location.pathname).toBe('/before'));
  });

  it('closes nested windows one at a time with one guard entry', async () => {
    mount();
    await open();
    const length = window.history.length;
    fireEvent.click(screen.getByText('Open nested'));
    await back();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'inner' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('dialog', { name: 'outer' })).toBeInTheDocument();
    expect(window.history.length).toBe(length);
    await back();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(window.history.state.librechatOverlay?.kind).toBe('closed'));
  });

  it('orders initially open nested windows correctly under StrictMode', async () => {
    mount(true);
    await waitFor(() => expect(window.history.state.librechatOverlay?.kind).toBe('open'));
    await back();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'inner' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('dialog', { name: 'outer' })).toBeInTheDocument();
  });

  it('keeps a window that refuses dismissal and accepts a later close', async () => {
    mount();
    await open();
    fireEvent.click(screen.getByText('Toggle refusal'));
    await back();
    expect(screen.getByRole('dialog', { name: 'outer' })).toBeInTheDocument();
    await waitFor(() => expect(window.history.state.librechatOverlay?.kind).toBe('open'));
    fireEvent.click(screen.getByText('Toggle refusal'));
    await back();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(window.history.state.librechatOverlay?.kind).toBe('closed'));
  });

  it('does not undo navigation issued in the same action as dismissal', async () => {
    mount();
    await open();
    fireEvent.click(screen.getByText('Navigate'));
    await waitFor(() => expect(screen.getByLabelText('route')).toHaveTextContent('/c/next'));
    await back();
    await waitFor(() => expect(router.state.location.key).toBe('chat'));
    expect(window.location.pathname).toBe('/c/chat');
  });

  it('protects a window reopened while explicit-close traversal is pending', async () => {
    mount();
    await open();
    fireEvent.click(screen.getByText('Close', { selector: 'button' }));
    fireEvent.click(screen.getByText('Open', { selector: 'button' }));
    await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
    await waitFor(() => expect(window.history.state.librechatOverlay?.kind).toBe('open'));
    await back();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(window.history.state.librechatOverlay?.kind).toBe('closed'));
  });

  it('does not add history or intercept navigation on desktop', async () => {
    mockIsMobile = false;
    mount();
    fireEvent.click(screen.getByText('Open', { selector: 'button' }));
    expect(window.history.state.key).toBe('chat');
    await back();
    await waitFor(() => expect(window.location.pathname).toBe('/before'));
  });

  it('does not resurrect a dismissed window on Forward and protects a reopened one', async () => {
    mount();
    await open();
    await back();
    await waitFor(() => expect(window.history.state.librechatOverlay?.kind).toBe('closed'));
    await act(async () => {
      await router.navigate(1);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await open();
    await back();
    await waitFor(() => expect(window.history.state.librechatOverlay?.kind).toBe('closed'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('skips an empty Forward entry when going Back again', async () => {
    mount();
    await open();
    fireEvent.click(screen.getByText('Close', { selector: 'button' }));
    await waitFor(() => expect(window.history.state.librechatOverlay?.kind).toBe('closed'));
    await act(async () => {
      await router.navigate(1);
    });
    await back();
    await waitFor(() => expect(router.state.location.pathname).toBe('/before'));
  });

  it('does not reopen a window after a router remount and skips its abandoned base', async () => {
    const view = mount();
    await open();
    view.unmount();
    router.dispose();
    router = createBrowserRouter([
      { element: <Overlays />, children: [{ path: '*', element: <Windows /> }] },
    ]);
    render(<RouterProvider router={router} useTransitions={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await back();
    await waitFor(() => expect(router.state.location.pathname).toBe('/before'));
  });

  it('does not undo navigation while explicit-close traversal is pending', async () => {
    mount();
    await open();
    fireEvent.click(screen.getByText('Close', { selector: 'button' }));
    fireEvent.click(screen.getByText('Navigate'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/next'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(router.state.location.pathname).toBe('/c/next');
  });

  it('preserves REPLACE semantics while an overlay is open', async () => {
    mount();
    await open();
    fireEvent.click(screen.getByText('Replace', { selector: 'button' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/next'));
    await back();
    await waitFor(() => expect(router.state.location.pathname).toBe('/before'));
  });

  it('keeps Forward direction across consecutive abandoned REPLACE entries', async () => {
    mount();
    for (const pathname of ['/c/next', '/c/third']) {
      await open();
      await act(async () => {
        await router.navigate(pathname, { replace: true });
      });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
    await back();
    await waitFor(() => expect(router.state.location.pathname).toBe('/before'));
    await act(async () => {
      window.history.forward();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/third'));
  });

  it.each(['before opening', 'while open'])(
    'preserves a mirrored streaming URL %s without switching routes',
    async (when) => {
      mount();
      if (when === 'while open') await open();
      fireEvent.click(screen.getByText('Promote URL'));
      if (when === 'before opening') await open();
      expect(window.location.pathname).toBe('/c/stream-123');
      expect(router.state.location.pathname).toBe('/c/chat');
      await back();
      await waitFor(() => expect(window.history.state.librechatOverlay?.kind).toBe('closed'));
      expect(window.location.pathname).toBe('/c/stream-123');
      expect(window.location.search).toBe('?model=example');
      expect(router.state.location.pathname).toBe('/c/chat');
      expect(window.history.state.usr).toEqual({ preserved: true });
    },
  );

  it.each(['before opening', 'while open'])(
    'keeps an overlay open when FINAL synchronizes a route mirrored %s',
    async (when) => {
      mount();
      if (when === 'while open') await open();
      fireEvent.click(screen.getByText('Promote URL'));
      if (when === 'before opening') await open();
      const length = window.history.length;
      await act(async () => {
        await router.navigate('/c/stream-123', { replace: true, state: { synchronized: true } });
      });
      expect(screen.getByRole('dialog', { name: 'outer' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/c/stream-123');
      expect(window.history.length).toBe(length);
      const key = router.state.location.key;
      await back();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(window.location.pathname).toBe('/c/stream-123');
      expect(window.location.search).toBe('');
      expect(window.history.state.key).toBe(key);
      expect(window.history.state.usr).toEqual({ synchronized: true });
      await back();
      await waitFor(() => expect(router.state.location.pathname).toBe('/before'));
    },
  );

  it('keeps nested overlays through FINAL and consumes explicit close without a dead Back step', async () => {
    mount();
    await open();
    fireEvent.click(screen.getByText('Open nested'));
    fireEvent.click(screen.getByText('Promote URL'));
    await act(async () => {
      await router.navigate('/c/stream-123', { replace: true });
    });
    expect(screen.getByRole('dialog', { name: 'inner' })).toBeInTheDocument();
    await back();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'inner' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('dialog', { name: 'outer' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close', { selector: 'button' }));
    await waitFor(() => expect(window.history.state.librechatOverlay?.kind).toBe('closed'));
    expect(window.location.pathname).toBe('/c/stream-123');
    await back();
    await waitFor(() => expect(router.state.location.pathname).toBe('/before'));
    await act(async () => {
      window.history.forward();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/stream-123'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    { pathname: '/c/stream-123', replace: false },
    { pathname: '/c/elsewhere', replace: true },
  ])('still dismisses on real navigation after mirroring: %o', async ({ pathname, replace }) => {
    mount();
    await open();
    fireEvent.click(screen.getByText('Promote URL'));
    await act(async () => {
      await router.navigate(pathname, { replace });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe(pathname);
  });
});
