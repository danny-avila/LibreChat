import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Artifacts from './Artifacts';

const mockRequestFullscreen = jest.fn<Promise<void>, []>();
const mockExitFullscreen = jest.fn<Promise<void>, []>();

jest.mock('@radix-ui/react-tabs', () => ({
  Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@librechat/client', () => ({
  Button: ({
    children,
    size: _size,
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }) => (
    <button {...props}>{children}</button>
  ),
  Spinner: () => <span />,
  useMediaQuery: () => false,
  Radio: () => null,
}));

jest.mock('recoil', () => ({
  useSetRecoilState: () => jest.fn(),
  useResetRecoilState: () => jest.fn(),
}));

jest.mock('~/Providers', () => ({
  useMutationState: () => ({ isMutating: false }),
  useShareContext: () => ({ isSharedConvo: false }),
}));

jest.mock('~/hooks/Artifacts/useArtifacts', () => ({
  __esModule: true,
  default: () => ({
    activeTab: 'preview',
    setActiveTab: jest.fn(),
    currentIndex: 0,
    currentArtifact: {
      id: 'artifact-1',
      type: 'text/html',
      title: 'Preview',
      content: '<h1>Preview</h1>',
      lastUpdateTime: 0,
    },
    orderedArtifactIds: ['artifact-1'],
    setCurrentArtifactId: jest.fn(),
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string): string =>
      key,
}));

jest.mock('~/utils/artifacts', () => ({
  isCodeOnlyArtifact: () => false,
  isPreviewOnlyArtifact: () => false,
}));

jest.mock('~/utils', () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(' '),
  logger: { error: jest.fn() },
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    artifactsVisibility: {},
    currentArtifactId: {},
  },
}));

jest.mock('~/components/Messages/Content/CopyButton', () => () => null);
jest.mock('~/components/Chat/Messages/Content/Parts/attachmentTypes', () => ({
  displayFilename: (title?: string) => title,
}));
jest.mock('./DownloadArtifact', () => () => null);
jest.mock('./ArtifactVersion', () => () => null);
jest.mock('./ArtifactTabs', () => () => <div />);

const setFullscreenElement = (element: Element | null) => {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    value: element,
  });
};

const renderArtifacts = () => {
  render(<Artifacts />);
  act(() => {
    jest.runOnlyPendingTimers();
  });
};

describe('Artifacts fullscreen preview', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setFullscreenElement(null);
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: mockRequestFullscreen,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: mockExitFullscreen,
    });
    mockRequestFullscreen.mockImplementation(function (this: HTMLElement) {
      setFullscreenElement(this);
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
    mockExitFullscreen.mockImplementation(() => {
      setFullscreenElement(null);
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('enters and exits fullscreen from the preview header', async () => {
    renderArtifacts();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'com_ui_enter_full_screen' }));
    });

    expect(mockRequestFullscreen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'com_ui_exit_full_screen' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'com_ui_exit_full_screen' }));
    });

    expect(mockExitFullscreen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'com_ui_enter_full_screen' })).toBeInTheDocument();
  });

  it('hides the fullscreen control when the browser does not support it', () => {
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      value: false,
    });

    renderArtifacts();

    expect(
      screen.queryByRole('button', { name: 'com_ui_enter_full_screen' }),
    ).not.toBeInTheDocument();
  });
});
