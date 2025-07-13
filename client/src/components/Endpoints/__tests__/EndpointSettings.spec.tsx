import { screen } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { SettingsViews, EModelEndpoint } from 'librechat-data-provider';
import EndpointSettings from '../EndpointSettings';
import { renderWithState, createMockConversation } from '~/test-utils/renderHelpers';
import store from '~/store';

const mockGetSettings = jest.fn();
jest.mock('../Settings', () => ({
  getSettings: () => mockGetSettings(),
}));

jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: jest.fn(() => ({ data: {} })),
}));

jest.mock('librechat-data-provider/react-query', () => ({
  useGetModelsQuery: jest.fn(() => ({ data: {} })),
}));

const MockSettingsComponent = ({ conversation, setOption, models, isPreset }: any) => (
  <div data-testid="mock-settings">
    <div data-testid="endpoint">{conversation?.endpoint}</div>
    <div data-testid="models-count">{models?.length || 0}</div>
    <div data-testid="is-preset">{isPreset.toString()}</div>
    <button data-testid="set-option-btn" onClick={() => setOption('test', 'value')} />
  </div>
);

const MockMultiViewComponent = ({ conversation, models, isPreset }: any) => (
  <div data-testid="mock-multiview">
    <div data-testid="multiview-endpoint">{conversation?.endpoint}</div>
    <div data-testid="multiview-models">{models?.length || 0}</div>
    <div data-testid="multiview-preset">{isPreset.toString()}</div>
  </div>
);

const mockUseGetModelsQuery = jest.requireMock(
  'librechat-data-provider/react-query',
).useGetModelsQuery;
const mockUseGetEndpointsQuery = jest.requireMock('~/data-provider').useGetEndpointsQuery;

describe('EndpointSettings Component', () => {
  const defaultProps = {
    conversation: createMockConversation({
      endpoint: EModelEndpoint.openAI,
    }),
    setOption: jest.fn(),
    isPreset: false,
    className: '',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSettings.mockReturnValue({
      settings: {},
      multiViewSettings: {},
    });
  });

  describe('Basic Rendering', () => {
    it('renders settings component when endpoint has single view', () => {
      mockGetSettings.mockReturnValue({
        settings: {
          [EModelEndpoint.openAI]: MockSettingsComponent,
        },
        multiViewSettings: {},
      });

      renderWithState(<EndpointSettings {...defaultProps} />, {
        recoilState: [[store.currentSettingsView, SettingsViews.default]],
      });

      expect(screen.getByTestId('mock-settings')).toBeInTheDocument();
      expect(screen.getByTestId('endpoint')).toHaveTextContent(EModelEndpoint.openAI);
    });

    it('renders multi-view component when endpoint has multi-view settings', () => {
      mockGetSettings.mockReturnValue({
        settings: {},
        multiViewSettings: {
          [EModelEndpoint.openAI]: MockMultiViewComponent,
        },
      });

      renderWithState(<EndpointSettings {...defaultProps} />, {
        recoilState: [[store.currentSettingsView, SettingsViews.default]],
      });

      expect(screen.getByTestId('mock-multiview')).toBeInTheDocument();
      expect(screen.getByTestId('multiview-endpoint')).toHaveTextContent(EModelEndpoint.openAI);
    });

    it('returns null when endpoint has no settings', () => {
      const { container } = renderWithState(<EndpointSettings {...defaultProps} />, {
        recoilState: [[store.currentSettingsView, SettingsViews.default]],
      });

      expect(container.firstChild).toBeNull();
    });

    it('returns null when currentSettingsView is not default', () => {
      mockGetSettings.mockReturnValue({
        settings: {
          [EModelEndpoint.openAI]: MockSettingsComponent,
        },
        multiViewSettings: {},
      });

      const { container } = renderWithState(<EndpointSettings {...defaultProps} />, {
        recoilState: [[store.currentSettingsView, 'agents' as SettingsViews]],
      });

      expect(container.firstChild).toBeNull();
    });

    it('returns null when conversation has no endpoint', () => {
      const propsWithoutEndpoint = {
        ...defaultProps,
        conversation: createMockConversation({ endpoint: '' as any }),
      };

      const { container } = renderWithState(<EndpointSettings {...propsWithoutEndpoint} />, {
        recoilState: [[store.currentSettingsView, SettingsViews.default]],
      });

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Model Data Handling', () => {
    it('passes models from query to settings component', () => {
      const mockModels = ['gpt-3.5-turbo', 'gpt-4'];
      mockUseGetModelsQuery.mockReturnValue({
        data: {
          [EModelEndpoint.openAI]: mockModels,
        },
      });

      mockGetSettings.mockReturnValue({
        settings: {
          [EModelEndpoint.openAI]: MockSettingsComponent,
        },
        multiViewSettings: {},
      });

      renderWithState(<EndpointSettings {...defaultProps} />, {
        recoilState: [[store.currentSettingsView, SettingsViews.default]],
      });

      expect(screen.getByTestId('models-count')).toHaveTextContent('2');
    });

    it('passes empty array when no models available', () => {
      mockUseGetModelsQuery.mockReturnValue({ data: {} });

      mockGetSettings.mockReturnValue({
        settings: {
          [EModelEndpoint.openAI]: MockSettingsComponent,
        },
        multiViewSettings: {},
      });

      renderWithState(<EndpointSettings {...defaultProps} />, {
        recoilState: [[store.currentSettingsView, SettingsViews.default]],
      });

      expect(screen.getByTestId('models-count')).toHaveTextContent('0');
    });

    it('handles null models data', () => {
      mockUseGetModelsQuery.mockReturnValue({ data: null });

      mockGetSettings.mockReturnValue({
        settings: {
          [EModelEndpoint.openAI]: MockSettingsComponent,
        },
        multiViewSettings: {},
      });

      renderWithState(<EndpointSettings {...defaultProps} />, {
        recoilState: [[store.currentSettingsView, SettingsViews.default]],
      });

      expect(screen.getByTestId('models-count')).toHaveTextContent('0');
    });
  });

  describe('Endpoint Type Resolution', () => {
    it('uses endpoint type from config when available', () => {
      mockUseGetEndpointsQuery.mockReturnValue({
        data: {
          [EModelEndpoint.openAI]: { type: 'custom-type' },
        },
      });

      mockGetSettings.mockReturnValue({
        settings: {
          'custom-type': MockSettingsComponent,
        },
        multiViewSettings: {},
      });

      renderWithState(<EndpointSettings {...defaultProps} />, {
        recoilState: [[store.currentSettingsView, SettingsViews.default]],
      });

      expect(screen.getByTestId('mock-settings')).toBeInTheDocument();
    });

    it('falls back to conversation endpoint when type not in config', () => {
      mockUseGetEndpointsQuery.mockReturnValue({ data: {} });

      mockGetSettings.mockReturnValue({
        settings: {
          [EModelEndpoint.openAI]: MockSettingsComponent,
        },
        multiViewSettings: {},
      });

      renderWithState(<EndpointSettings {...defaultProps} />, {
        recoilState: [[store.currentSettingsView, SettingsViews.default]],
      });

      expect(screen.getByTestId('mock-settings')).toBeInTheDocument();
    });
  });

  describe('Props Passing', () => {
    it('passes all props to settings component', () => {
      const mockSetOption = jest.fn();
      mockGetSettings.mockReturnValue({
        settings: {
          [EModelEndpoint.openAI]: MockSettingsComponent,
        },
        multiViewSettings: {},
      });

      renderWithState(
        <EndpointSettings {...defaultProps} setOption={mockSetOption} isPreset={true} />,
        {
          recoilState: [[store.currentSettingsView, SettingsViews.default]],
        },
      );

      expect(screen.getByTestId('is-preset')).toHaveTextContent('true');

      const button = screen.getByTestId('set-option-btn');
      button.click();

      expect(mockSetOption).toHaveBeenCalledWith('test', 'value');
    });

    it('applies custom className to wrapper div', () => {
      mockGetSettings.mockReturnValue({
        settings: {
          [EModelEndpoint.openAI]: MockSettingsComponent,
        },
        multiViewSettings: {},
      });

      renderWithState(<EndpointSettings {...defaultProps} className="custom-class" />, {
        recoilState: [[store.currentSettingsView, SettingsViews.default]],
      });

      const wrapper = screen.getByTestId('mock-settings').parentElement;
      expect(wrapper).toHaveClass('custom-class');
    });
  });

  describe('Settings Priority', () => {
    it('prioritizes single view over multi-view when both exist', () => {
      mockGetSettings.mockReturnValue({
        settings: {
          [EModelEndpoint.openAI]: MockSettingsComponent,
        },
        multiViewSettings: {
          [EModelEndpoint.openAI]: MockMultiViewComponent,
        },
      });

      renderWithState(<EndpointSettings {...defaultProps} />, {
        recoilState: [[store.currentSettingsView, SettingsViews.default]],
      });

      expect(screen.getByTestId('mock-settings')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-multiview')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles null or undefined conversation', () => {
      const { container } = renderWithState(
        <EndpointSettings {...defaultProps} conversation={null as any} />,
        {
          recoilState: [[store.currentSettingsView, SettingsViews.default]],
        },
      );

      expect(container.firstChild).toBeNull();
    });

    it('handles different endpoint types', () => {
      const endpoints = [
        EModelEndpoint.anthropic,
        EModelEndpoint.google,
        EModelEndpoint.assistants,
        EModelEndpoint.azureOpenAI,
      ];

      endpoints.forEach((endpoint) => {
        mockGetSettings.mockReturnValue({
          settings: {
            [endpoint]: MockSettingsComponent,
          },
          multiViewSettings: {},
        });

        const { rerender } = renderWithState(
          <EndpointSettings
            {...defaultProps}
            conversation={createMockConversation({ endpoint })}
          />,
          {
            recoilState: [[store.currentSettingsView, SettingsViews.default]],
          },
        );

        expect(screen.getByTestId('endpoint')).toHaveTextContent(endpoint);
        rerender(<div />);
      });
    });

    it('handles settings view changes', () => {
      mockGetSettings.mockReturnValue({
        settings: {
          [EModelEndpoint.openAI]: MockSettingsComponent,
        },
        multiViewSettings: {},
      });

      const { rerender } = renderWithState(<EndpointSettings {...defaultProps} />, {
        recoilState: [[store.currentSettingsView, SettingsViews.default]],
      });

      expect(screen.getByTestId('mock-settings')).toBeInTheDocument();

      rerender(
        <RecoilRoot
          initializeState={({ set }) => {
            set(store.currentSettingsView, 'agents' as SettingsViews);
          }}
        >
          <EndpointSettings {...defaultProps} />
        </RecoilRoot>,
      );

      expect(screen.queryByTestId('mock-settings')).not.toBeInTheDocument();
    });
  });
});
