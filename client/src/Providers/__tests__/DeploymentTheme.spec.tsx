import { useState } from 'react';
import { RecoilRoot } from 'recoil';
import { act, render, waitFor } from '@testing-library/react';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TStartupConfig } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import DeploymentTheme from '../DeploymentTheme';

const mockGetThemeFromEnv = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

jest.mock('~/utils/getThemeFromEnv', () => ({
  getThemeFromEnv: () => mockGetThemeFromEnv(),
}));

type ConfigTheme = NonNullable<TStartupConfig['interface']>['theme'];

const THEME_KEYS = ['theme-definition', 'theme-colors', 'theme-name', 'theme-source'];

const storedDefinition = {
  version: 1,
  name: 'stored',
  modes: { light: { colors: { 'rgb-accent-primary': '1 2 3' } } },
};

const inlineTheme = {
  version: 1 as const,
  name: 'acme',
  modes: {
    light: {
      colors: { 'rgb-surface-primary': '10 20 30' },
      appearance: { controlRadius: '2px' },
    },
    dark: { colors: { 'rgb-surface-primary': '40 50 60' } },
  },
};

const configWith = (theme?: ConfigTheme) =>
  ({ interface: theme === undefined ? {} : { theme } }) as TStartupConfig;

const snapshotStorage = () => THEME_KEYS.map((key) => localStorage.getItem(key));

const root = () => document.documentElement;

function StartupConsumer() {
  useGetStartupConfig();
  return null;
}

let mountRoute: () => void = () => undefined;

/** Mounts a startup config consumer later without re-rendering the wrapper, as a route does. */
function LateRoute() {
  const [mounted, setMounted] = useState(false);
  mountRoute = () => setMounted(true);
  return mounted ? <StartupConsumer /> : null;
}

function renderTheme(queryClient: QueryClient) {
  return render(
    <RecoilRoot>
      <QueryClientProvider client={queryClient}>
        <DeploymentTheme>
          <LateRoute />
        </DeploymentTheme>
      </QueryClientProvider>
    </RecoilRoot>,
  );
}

describe('DeploymentTheme', () => {
  let queryClient: QueryClient;
  let getStartupConfig: jest.SpyInstance;
  let warn: jest.SpyInstance;

  const serveTheme = (theme?: ConfigTheme) => getStartupConfig.mockResolvedValue(configWith(theme));

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('theme', 'light');
    localStorage.setItem('theme-definition', JSON.stringify(storedDefinition));
    localStorage.setItem('theme-name', 'stored');
    localStorage.setItem('theme-source', 'definition');
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    getStartupConfig = jest.spyOn(dataService, 'getStartupConfig');
    mockGetThemeFromEnv.mockReturnValue(undefined);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    queryClient.clear();
    getStartupConfig.mockRestore();
    warn.mockRestore();
    mockGetThemeFromEnv.mockReset();
  });

  it('resolves a bundled theme name without touching stored preferences', async () => {
    const before = snapshotStorage();
    serveTheme('clickhouse');
    renderTheme(queryClient);

    await waitFor(() => expect(root().dataset.theme).toBe('clickhouse'));
    expect(root().style.getPropertyValue('--surface-primary')).toBe('255 255 255');
    expect(snapshotStorage()).toEqual(before);
    expect(warn).not.toHaveBeenCalled();
  });

  it('applies a valid inline definition without persisting it', async () => {
    const before = snapshotStorage();
    serveTheme(inlineTheme);
    renderTheme(queryClient);

    await waitFor(() => expect(root().dataset.theme).toBe('acme'));
    expect(root().style.getPropertyValue('--surface-primary')).toBe('10 20 30');
    expect(root().style.getPropertyValue('--theme-control-radius')).toBe('2px');
    expect(snapshotStorage()).toEqual(before);
  });

  it('ignores an invalid inline definition with a warning and keeps the stored theme', async () => {
    serveTheme({
      ...inlineTheme,
      modes: { light: { colors: { 'rgb-not-a-token': '1 2 3' } } },
    });
    renderTheme(queryClient);

    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(warn.mock.calls[0][0]).toContain('Unknown color token: rgb-not-a-token');
    expect(root().dataset.theme).toBe('stored');
  });

  it('rejects names that are not deployment themes', async () => {
    serveTheme('high-contrast');
    renderTheme(queryClient);

    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(warn.mock.calls[0][0]).toContain('"high-contrast"');
    expect(root().dataset.theme).toBe('stored');
  });

  it('prefers the yaml theme over the build-time environment colors', async () => {
    mockGetThemeFromEnv.mockReturnValue({ 'rgb-surface-primary': '99 99 99' });
    serveTheme(inlineTheme);
    renderTheme(queryClient);

    await waitFor(() => expect(root().dataset.theme).toBe('acme'));
    expect(root().style.getPropertyValue('--surface-primary')).toBe('10 20 30');
  });

  it('falls back to the environment colors when no yaml theme is set', async () => {
    mockGetThemeFromEnv.mockReturnValue({ 'rgb-surface-primary': '99 99 99' });
    serveTheme();
    renderTheme(queryClient);

    await waitFor(() => expect(getStartupConfig).toHaveBeenCalled());
    await waitFor(() =>
      expect(root().style.getPropertyValue('--surface-primary')).toBe('99 99 99'),
    );
    expect(root().dataset.theme).not.toBe('clickhouse');
  });

  const replaceConfig = (theme?: ConfigTheme) =>
    act(() => {
      queryClient.setQueryData([QueryKeys.startupConfig, false, 'default'], configWith(theme));
    });

  it('restores the stored theme when the deployment theme is withdrawn', async () => {
    const before = snapshotStorage();
    serveTheme('clickhouse');
    renderTheme(queryClient);
    await waitFor(() => expect(root().dataset.theme).toBe('clickhouse'));

    replaceConfig();

    await waitFor(() => expect(root().dataset.theme).toBe('stored'));
    expect(root().style.getPropertyValue('--accent-primary')).toBe('1 2 3');
    expect(snapshotStorage()).toEqual(before);
  });

  it('restores a legacy color map behind a corrupt stored definition when the deployment theme is withdrawn', async () => {
    localStorage.setItem('theme-definition', '{not json');
    localStorage.setItem('theme-colors', JSON.stringify({ 'rgb-accent-primary': '7 8 9' }));
    localStorage.setItem('theme-name', 'legacy-colors');
    localStorage.setItem('theme-source', 'legacy');
    const before = snapshotStorage();
    serveTheme('clickhouse');
    renderTheme(queryClient);
    await waitFor(() => expect(root().dataset.theme).toBe('clickhouse'));

    replaceConfig();

    await waitFor(() => expect(root().dataset.theme).toBe('legacy-colors'));
    expect(root().style.getPropertyValue('--accent-primary')).toBe('7 8 9');
    expect(snapshotStorage()).toEqual(before);
  });

  it('falls back to the environment colors when the deployment theme is withdrawn', async () => {
    mockGetThemeFromEnv.mockReturnValue({ 'rgb-surface-primary': '99 99 99' });
    serveTheme('clickhouse');
    renderTheme(queryClient);
    await waitFor(() => expect(root().dataset.theme).toBe('clickhouse'));

    replaceConfig();

    await waitFor(() =>
      expect(root().style.getPropertyValue('--surface-primary')).toBe('99 99 99'),
    );
    expect(root().dataset.theme).not.toBe('stored');
  });

  it('picks up the theme after the auth flow removes the startup config query', async () => {
    const before = snapshotStorage();
    getStartupConfig.mockReturnValueOnce(new Promise(() => undefined));
    renderTheme(queryClient);
    await waitFor(() => expect(getStartupConfig).toHaveBeenCalledTimes(1));

    /** What the refresh-token and login mutations do in `onMutate`. */
    act(() => queryClient.removeQueries());
    serveTheme('clickhouse');
    act(() => mountRoute());

    await waitFor(() => expect(root().dataset.theme).toBe('clickhouse'));
    expect(getStartupConfig).toHaveBeenCalledTimes(2);
    expect(snapshotStorage()).toEqual(before);
  });
});
