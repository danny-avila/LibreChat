import { renderHook, waitFor } from '@testing-library/react';
import useAdaptiveIcon from '../useAdaptiveIcon';

const MONO_SVG = '<svg><path fill="#000000" d="M0 0h10v10H0z" /></svg>';
const COLOR_SVG = '<svg><path fill="#ff0000" /></svg>';

function mockFetch(map: Record<string, string | 'hang'>) {
  const impl = (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    const value = map[url];
    if (value === 'hang' || value === undefined) {
      return new Promise<Response>(() => {});
    }
    return Promise.resolve({ ok: true, text: () => Promise.resolve(value) } as Response);
  };
  global.fetch = Object.assign(impl, { preconnect: () => {} });
}

describe('useAdaptiveIcon', () => {
  it('does not tint a raster image', () => {
    mockFetch({});
    const { result } = renderHook(() => useAdaptiveIcon('/logo-raster-1.png'));
    expect(result.current.shouldTint).toBe(false);
  });

  it('tints a monochrome svg once resolved', async () => {
    mockFetch({ '/mono-1.svg': MONO_SVG });
    const { result } = renderHook(() => useAdaptiveIcon('/mono-1.svg'));
    await waitFor(() => expect(result.current.shouldTint).toBe(true));
  });

  it('does not tint a multi-color svg', async () => {
    mockFetch({ '/color-1.svg': COLOR_SVG });
    const { result } = renderHook(() => useAdaptiveIcon('/color-1.svg'));
    // give the resolution a tick; it must remain false
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.shouldTint).toBe(false);
  });

  it('drops the previous tint immediately when src changes to a raster image', async () => {
    mockFetch({ '/mono-2.svg': MONO_SVG });
    const { result, rerender } = renderHook(({ src }) => useAdaptiveIcon(src), {
      initialProps: { src: '/mono-2.svg' },
    });
    await waitFor(() => expect(result.current.shouldTint).toBe(true));

    rerender({ src: '/logo-raster-2.png' });
    expect(result.current.shouldTint).toBe(false);
  });

  it('does not leak the previous tint to a new, still-resolving svg', async () => {
    // first svg resolves monochrome; second svg never resolves (cache miss, pending)
    mockFetch({ '/mono-3.svg': MONO_SVG, '/pending.svg': 'hang' });
    const { result, rerender } = renderHook(({ src }) => useAdaptiveIcon(src), {
      initialProps: { src: '/mono-3.svg' },
    });
    await waitFor(() => expect(result.current.shouldTint).toBe(true));

    // On the old code this stayed true until the (never-arriving) fetch resolved.
    rerender({ src: '/pending.svg' });
    expect(result.current.shouldTint).toBe(false);
  });
});
