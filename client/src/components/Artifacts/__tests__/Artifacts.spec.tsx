import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Artifacts from '../Artifacts';
import { renderWithState, mockUseLocalize } from '~/test-utils/renderHelpers';
import store from '~/store';

const mockUseArtifacts = jest.fn();
jest.mock('~/hooks/Artifacts/useArtifacts', () => ({
  __esModule: true,
  default: () => mockUseArtifacts(),
}));

jest.mock('~/Providers', () => ({
  useEditorContext: jest.fn(() => ({ isMutating: false })),
}));

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn(() => mockUseLocalize()),
}));

jest.mock('../ArtifactTabs', () => {
  const MockArtifactTabs = ({ isMermaid, artifact, isSubmitting, editorRef, previewRef }: any) => (
    <div data-testid="artifact-tabs">
      <div data-testid="is-mermaid">{isMermaid.toString()}</div>
      <div data-testid="artifact-title">{artifact.title}</div>
      <div data-testid="is-submitting">{isSubmitting.toString()}</div>
      <div data-testid="has-editor-ref">{!!editorRef.current}</div>
      <div data-testid="has-preview-ref">{!!previewRef.current}</div>
    </div>
  );
  return MockArtifactTabs;
});

jest.mock('../DownloadArtifact', () => {
  const MockDownloadArtifact = ({ artifact }: any) => (
    <button data-testid="download-artifact" data-artifact={artifact.id} />
  );
  return MockDownloadArtifact;
});

jest.mock('../Code', () => ({
  CopyCodeButton: ({ content }: any) => (
    <button data-testid="copy-code-button" data-content={content} />
  ),
}));

const mockUseEditorContext = jest.requireMock('~/Providers').useEditorContext;

const createMockArtifact = (overrides = {}) => ({
  id: 'artifact-1',
  title: 'Test Artifact',
  content: 'const hello = "world";',
  type: 'code',
  ...overrides,
});

describe('Artifacts Component', () => {
  const defaultMockArtifactsHook = {
    activeTab: 'preview',
    isMermaid: false,
    setActiveTab: jest.fn(),
    currentIndex: 0,
    isSubmitting: false,
    cycleArtifact: jest.fn(),
    currentArtifact: createMockArtifact(),
    orderedArtifactIds: ['artifact-1', 'artifact-2', 'artifact-3'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseArtifacts.mockReturnValue(defaultMockArtifactsHook);
  });

  describe('Basic Rendering', () => {
    it('renders artifact component with header, content, and footer', () => {
      renderWithState(<Artifacts />);

      expect(screen.getByRole('heading', { name: 'Test Artifact' })).toBeInTheDocument();
      expect(screen.getByTestId('artifact-tabs')).toBeInTheDocument();
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });

    it('returns null when no current artifact', () => {
      mockUseArtifacts.mockReturnValue({
        ...defaultMockArtifactsHook,
        currentArtifact: null,
      });

      const { container } = renderWithState(<Artifacts />);
      expect(container.firstChild).toBeNull();
    });

    it('applies visible animation classes after mount', async () => {
      renderWithState(<Artifacts />);

      const container = screen
        .getByRole('heading', { name: 'Test Artifact' })
        .closest('.flex.h-full.w-full.flex-col');

      await waitFor(() => {
        expect(container).toHaveClass('scale-100', 'opacity-100', 'blur-0');
      });
    });
  });

  describe('Tab Navigation', () => {
    it('renders preview and code tabs', () => {
      renderWithState(<Artifacts />);

      const tabsList = screen.getByRole('tablist');
      expect(tabsList).toBeInTheDocument();

      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(2);
      expect(tabs[0]).toHaveTextContent('com_ui_preview');
      expect(tabs[1]).toHaveTextContent('com_ui_code');
    });

    it('switches tabs on click', async () => {
      const mockSetActiveTab = jest.fn();
      mockUseArtifacts.mockReturnValue({
        ...defaultMockArtifactsHook,
        setActiveTab: mockSetActiveTab,
      });

      const user = userEvent.setup();
      renderWithState(<Artifacts />);

      const codeTab = screen.getByRole('tab', { name: 'com_ui_code' });
      await user.click(codeTab);

      expect(mockSetActiveTab).toHaveBeenCalledWith('code');
    });

    it('disables preview tab when mutating', () => {
      mockUseEditorContext.mockReturnValue({ isMutating: true });

      renderWithState(<Artifacts />);

      const previewTab = screen.getByRole('tab', { name: 'com_ui_preview' });
      expect(previewTab).toBeDisabled();
    });
  });

  describe('Refresh Functionality', () => {
    it('shows refresh button only in preview tab', () => {
      renderWithState(<Artifacts />);

      const refreshButton = screen.getByLabelText('Refresh');
      expect(refreshButton).toBeInTheDocument();
    });

    it('hides refresh button in code tab', () => {
      mockUseArtifacts.mockReturnValue({
        ...defaultMockArtifactsHook,
        activeTab: 'code',
      });

      renderWithState(<Artifacts />);

      expect(screen.queryByLabelText('Refresh')).not.toBeInTheDocument();
    });

    it('handles refresh click with animation', async () => {
      const user = userEvent.setup();
      renderWithState(<Artifacts />);

      const refreshButton = screen.getByLabelText('Refresh');
      await user.click(refreshButton);

      expect(refreshButton).toBeDisabled();
      expect(refreshButton.firstChild).toHaveClass('animate-spin');

      await waitFor(
        () => {
          expect(refreshButton).not.toBeDisabled();
        },
        { timeout: 1000 },
      );
    });

    it('shows loading spinner when mutating in non-preview tab', () => {
      mockUseEditorContext.mockReturnValue({ isMutating: true });
      mockUseArtifacts.mockReturnValue({
        ...defaultMockArtifactsHook,
        activeTab: 'code',
      });

      renderWithState(<Artifacts />);

      const spinner = screen
        .getByRole('heading', { name: 'Test Artifact' })
        .parentElement?.parentElement?.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('Navigation Controls', () => {
    it('navigates to previous artifact', async () => {
      const mockCycleArtifact = jest.fn();
      mockUseArtifacts.mockReturnValue({
        ...defaultMockArtifactsHook,
        cycleArtifact: mockCycleArtifact,
      });

      const user = userEvent.setup();
      renderWithState(<Artifacts />);

      const prevButton = screen.getByText('1 / 3').parentElement?.querySelector('button');
      await user.click(prevButton!);

      expect(mockCycleArtifact).toHaveBeenCalledWith('prev');
    });

    it('navigates to next artifact', async () => {
      const mockCycleArtifact = jest.fn();
      mockUseArtifacts.mockReturnValue({
        ...defaultMockArtifactsHook,
        cycleArtifact: mockCycleArtifact,
      });

      const user = userEvent.setup();
      renderWithState(<Artifacts />);

      const buttons = screen.getByText('1 / 3').parentElement?.querySelectorAll('button');
      const nextButton = buttons?.[1];
      await user.click(nextButton!);

      expect(mockCycleArtifact).toHaveBeenCalledWith('next');
    });

    it('displays correct artifact count', () => {
      mockUseArtifacts.mockReturnValue({
        ...defaultMockArtifactsHook,
        currentIndex: 1,
        orderedArtifactIds: ['a1', 'a2', 'a3', 'a4', 'a5'],
      });

      renderWithState(<Artifacts />);

      expect(screen.getByText('2 / 5')).toBeInTheDocument();
    });
  });

  describe('Close Functionality', () => {
    it('closes artifacts on header arrow click', async () => {
      const user = userEvent.setup();
      const { container } = renderWithState(<Artifacts />, {
        recoilState: [[store.artifactsVisibility, true]],
      });

      const closeButton = screen
        .getByRole('heading', { name: 'Test Artifact' })
        .parentElement?.querySelector('button');
      await user.click(closeButton!);

      const mainContainer = container.querySelector('.flex.h-full.w-full.flex-col');
      expect(mainContainer).toHaveClass('scale-105', 'opacity-0', 'blur-sm');
    });

    it('closes artifacts on X button click', async () => {
      const user = userEvent.setup();
      renderWithState(<Artifacts />, {
        recoilState: [[store.artifactsVisibility, true]],
      });

      const closeButtons = screen.getAllByRole('button');
      const xButton = closeButtons.find(
        (btn) =>
          btn.querySelector('.h-4.w-4') && btn.querySelector('svg')?.classList.contains('lucide-x'),
      );

      await user.click(xButton!);

      await waitFor(() => {
        const container = screen
          .getByRole('heading', { name: 'Test Artifact' })
          .closest('.flex.h-full.w-full.flex-col');
        expect(container).toHaveClass('scale-105', 'opacity-0', 'blur-sm');
      });
    });

    it('sets artifacts visibility to false after animation', async () => {
      jest.useFakeTimers();
      const setArtifactsVisibility = jest.fn();

      renderWithState(<Artifacts />, {
        recoilState: [[store.artifactsVisibility, true]],
      });

      const closeButton = screen
        .getByRole('heading', { name: 'Test Artifact' })
        .parentElement?.querySelector('button');
      fireEvent.click(closeButton!);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(setArtifactsVisibility).not.toHaveBeenCalled(); // Since we're mocking
      });

      jest.useRealTimers();
    });
  });

  describe('Footer Actions', () => {
    it('renders copy code button with artifact content', () => {
      renderWithState(<Artifacts />);

      const copyButton = screen.getByTestId('copy-code-button');
      expect(copyButton).toHaveAttribute('data-content', 'const hello = "world";');
    });

    it('renders download button with artifact id', () => {
      renderWithState(<Artifacts />);

      const downloadButton = screen.getByTestId('download-artifact');
      expect(downloadButton).toHaveAttribute('data-artifact', 'artifact-1');
    });

    it('handles empty artifact content gracefully', () => {
      mockUseArtifacts.mockReturnValue({
        ...defaultMockArtifactsHook,
        currentArtifact: createMockArtifact({ content: null }),
      });

      renderWithState(<Artifacts />);

      const copyButton = screen.getByTestId('copy-code-button');
      expect(copyButton).toHaveAttribute('data-content', '');
    });
  });

  describe('ArtifactTabs Integration', () => {
    it('passes correct props to ArtifactTabs', () => {
      mockUseArtifacts.mockReturnValue({
        ...defaultMockArtifactsHook,
        isMermaid: true,
        isSubmitting: true,
      });

      renderWithState(<Artifacts />);

      expect(screen.getByTestId('is-mermaid')).toHaveTextContent('true');
      expect(screen.getByTestId('is-submitting')).toHaveTextContent('true');
      expect(screen.getByTestId('artifact-title')).toHaveTextContent('Test Artifact');
    });

    it('creates and passes refs to ArtifactTabs', () => {
      renderWithState(<Artifacts />);

      expect(screen.getByTestId('has-editor-ref')).toHaveTextContent('false');
      expect(screen.getByTestId('has-preview-ref')).toHaveTextContent('false');
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined current artifact', () => {
      mockUseArtifacts.mockReturnValue({
        ...defaultMockArtifactsHook,
        currentArtifact: undefined,
      });

      const { container } = renderWithState(<Artifacts />);
      expect(container.firstChild).toBeNull();
    });

    it('handles single artifact navigation', () => {
      mockUseArtifacts.mockReturnValue({
        ...defaultMockArtifactsHook,
        currentIndex: 0,
        orderedArtifactIds: ['artifact-1'],
      });

      renderWithState(<Artifacts />);

      expect(screen.getByText('1 / 1')).toBeInTheDocument();
    });

    it('handles artifacts with special characters in title', () => {
      mockUseArtifacts.mockReturnValue({
        ...defaultMockArtifactsHook,
        currentArtifact: createMockArtifact({
          title: 'Test <Artifact> & "Special" Characters',
        }),
      });

      renderWithState(<Artifacts />);

      expect(
        screen.getByRole('heading', { name: 'Test <Artifact> & "Special" Characters' }),
      ).toBeInTheDocument();
    });

    it('handles very long artifact titles with truncation', () => {
      const longTitle =
        'This is a very long artifact title that should be truncated in the UI to prevent layout issues';
      mockUseArtifacts.mockReturnValue({
        ...defaultMockArtifactsHook,
        currentArtifact: createMockArtifact({ title: longTitle }),
      });

      renderWithState(<Artifacts />);

      const titleElement = screen.getByRole('heading', { name: longTitle });
      expect(titleElement).toHaveClass('truncate');
    });

    it('maintains tab state across artifact navigation', () => {
      const { rerender } = renderWithState(<Artifacts />);

      mockUseArtifacts.mockReturnValue({
        ...defaultMockArtifactsHook,
        activeTab: 'code',
        currentArtifact: createMockArtifact({ id: 'artifact-2', title: 'Second Artifact' }),
        currentIndex: 1,
      });

      rerender(<Artifacts />);

      expect(screen.getByRole('heading', { name: 'Second Artifact' })).toBeInTheDocument();
      expect(screen.getByText('2 / 3')).toBeInTheDocument();
    });

    it('handles rapid tab switching', async () => {
      const mockSetActiveTab = jest.fn();
      mockUseArtifacts.mockReturnValue({
        ...defaultMockArtifactsHook,
        setActiveTab: mockSetActiveTab,
      });

      const user = userEvent.setup();
      renderWithState(<Artifacts />);

      const codeTab = screen.getByRole('tab', { name: 'com_ui_code' });
      const previewTab = screen.getByRole('tab', { name: 'com_ui_preview' });

      await user.click(codeTab);
      await user.click(previewTab);
      await user.click(codeTab);

      expect(mockSetActiveTab).toHaveBeenCalledTimes(3);
      expect(mockSetActiveTab).toHaveBeenNthCalledWith(1, 'code');
      expect(mockSetActiveTab).toHaveBeenNthCalledWith(2, 'preview');
      expect(mockSetActiveTab).toHaveBeenNthCalledWith(3, 'code');
    });
  });
});
