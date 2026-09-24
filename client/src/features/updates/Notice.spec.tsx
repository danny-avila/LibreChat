import { RecoilRoot } from 'recoil';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FrontendUpdateNotice from './Notice';

const currentId = `assets-${'a'.repeat(64)}`;
const expectedId = `assets-${'b'.repeat(64)}`;

function renderUpdateNotice(buildId = currentId) {
  const meta = document.createElement('meta');
  meta.name = 'lc-asset-build-id';
  meta.content = buildId;
  document.head.append(meta);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <RecoilRoot>
        <FrontendUpdateNotice />
      </RecoilRoot>
    </QueryClientProvider>,
  );
  return { ...result, meta };
}

describe('frontend update notice', () => {
  afterEach(() => {
    delete (globalThis as { fetch?: typeof fetch }).fetch;
    document.querySelectorAll('meta[name="lc-asset-build-id"]').forEach((el) => el.remove());
    document.querySelectorAll('[data-test-draft]').forEach((el) => el.remove());
  });

  it('announces a confirmed asset mismatch without discarding a typed draft', async () => {
    const url = new URL('/version.json', window.location.origin).href;
    const fetcher = jest.fn(
      async () =>
        ({
          ok: true,
          url,
          headers: {
            get: (key: string) => (key === 'content-type' ? 'application/json' : 'no-store'),
          },
          json: async () => ({
            schemaVersion: 1,
            buildId: expectedId,
            assetManifestHash: 'b'.repeat(64),
          }),
        }) as Response,
    );
    globalThis.fetch = Object.assign(fetcher, { preconnect: () => undefined });
    const textarea = document.createElement('textarea');
    textarea.dataset.testDraft = '';
    textarea.value = 'an unsent message';
    document.body.append(textarea);
    const { unmount } = renderUpdateNotice();
    expect(await screen.findByRole('status', {}, { timeout: 6000 })).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Reload the page' }));
    expect(
      await screen.findByText('Your current work is still active. Finish it before reloading.'),
    ).toBeInTheDocument();
    expect(textarea.value).toBe('an unsent message');
    expect(fetcher).toHaveBeenCalledTimes(2);
    unmount();
  });
});
