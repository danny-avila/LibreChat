import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentType } from 'librechat-data-provider';
import { paramSettings, ComponentTypes, EModelEndpoint } from 'librechat-data-provider';
import Panel from '../Panel';
import { renderWithState, createMockConversation } from '~/test-utils/renderHelpers';

const mockSetConversation = jest.fn();
const mockSetOption = jest.fn();

jest.mock('~/Providers', () => ({
  useChatContext: jest.fn(),
}));

jest.mock('~/hooks', () => ({
  useSetIndexOptions: jest.fn(() => ({
    setOption: mockSetOption,
  })),
  useLocalize: jest.fn(() => (key: string, values?: Record<string, string>) => {
    if (key === 'com_ui_reset_var' && values?.[0]) {
      return `Reset ${values[0]}`;
    }
    if (key === 'com_ui_model_parameters') {
      return 'Model Parameters';
    }
    if (key === 'com_endpoint_save_as_preset') {
      return 'Save As Preset';
    }
    return key;
  }),
}));

jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: jest.fn(() => ({
    data: {
      openAI: {
        customParams: {},
      },
    },
  })),
}));

jest.mock('~/components/Endpoints', () => ({
  SaveAsPresetDialog: jest.fn(({ open, onOpenChange, preset }) =>
    open ? (
      <div data-testid="save-preset-dialog">
        <button onClick={() => onOpenChange(false)} aria-label="Close dialog" />
        <div>{JSON.stringify(preset)}</div>
      </div>
    ) : null,
  ),
}));

jest.mock('../components', () => {
  const MockDynamicComponent = jest.fn(
    ({ settingKey, label, description, placeholder, conversation, setOption, defaultValue }) => {
      const React = jest.requireActual('react');
      return React.createElement(
        'div',
        { 'data-testid': `dynamic-${settingKey}` },
        React.createElement('div', null, label),
        description && React.createElement('div', null, description),
        React.createElement('input', {
          placeholder: placeholder,
          value: conversation?.[settingKey] ?? defaultValue ?? '',
          onChange: (e: any) => setOption(settingKey)(e.target.value),
        }),
      );
    },
  );

  return {
    componentMapping: {
      slider: MockDynamicComponent,
      dropdown: MockDynamicComponent,
      switch: MockDynamicComponent,
      textarea: MockDynamicComponent,
      input: MockDynamicComponent,
      checkbox: MockDynamicComponent,
      tags: MockDynamicComponent,
      combobox: MockDynamicComponent,
    },
  };
});

jest.mock('~/utils', () => ({
  getEndpointField: jest.fn((_config: any, endpoint: string, field: string) => {
    if (field === 'type' && endpoint === 'azureOpenAI') {
      return 'azure';
    }
    return null;
  }),
  logger: {
    log: jest.fn(),
  },
}));

const mockUseChatContext = jest.requireMock('~/Providers').useChatContext;
const mockUseGetEndpointsQuery = jest.requireMock('~/data-provider').useGetEndpointsQuery;
const mockComponentMapping = jest.requireMock('../components').componentMapping;
const getMockDynamicComponent = () => mockComponentMapping.slider;

describe('Parameters Panel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseChatContext.mockImplementation(() => ({
      conversation: createMockConversation({
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-4',
        temperature: 0.7,
        max_tokens: 1000,
      }),
      setConversation: mockSetConversation,
    }));
    mockSetConversation.mockImplementation((updater) => {
      if (typeof updater === 'function') {
        return updater(mockUseChatContext().conversation);
      }
      return updater;
    });

    // Clear existing paramSettings and set our test parameters
    Object.keys(paramSettings).forEach((key) => {
      delete paramSettings[key];
    });

    paramSettings[EModelEndpoint.openAI] = [
      {
        key: 'temperature',
        label: 'Temperature',
        type: 'number',
        component: ComponentTypes.Slider as ComponentType,
        default: 0.7,
      },
      {
        key: 'max_tokens',
        label: 'Max Tokens',
        type: 'number',
        component: ComponentTypes.Input as ComponentType,
        default: 1000,
      },
    ];

    // Reset all component mappings
    Object.keys(mockComponentMapping).forEach((key) => {
      mockComponentMapping[key] = getMockDynamicComponent();
    });
  });

  afterEach(() => {
    // Clean up paramSettings
    Object.keys(paramSettings).forEach((key) => {
      delete paramSettings[key];
    });
  });

  describe('Basic Rendering', () => {
    it('renders parameter components based on endpoint configuration', () => {
      renderWithState(<Panel />);

      expect(screen.getByTestId('dynamic-temperature')).toBeInTheDocument();
      expect(screen.getByTestId('dynamic-max_tokens')).toBeInTheDocument();
    });

    it('renders reset and save preset buttons', () => {
      renderWithState(<Panel />);

      expect(screen.getByRole('button', { name: /reset.*model.*parameters/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save.*preset/i })).toBeInTheDocument();
    });

    it('renders with custom endpoint parameters', () => {
      mockUseGetEndpointsQuery.mockReturnValue({
        data: {
          openAI: {
            customParams: {
              paramDefinitions: [
                {
                  key: 'temperature',
                  label: 'Custom Temperature',
                  type: 'number',
                  component: ComponentTypes.Slider as ComponentType,
                  default: 0.5,
                },
              ],
            },
          },
        },
      });

      renderWithState(<Panel />);

      expect(screen.getByTestId('dynamic-temperature')).toBeInTheDocument();
    });

    it('renders with Bedrock regions when available', () => {
      mockUseChatContext.mockReturnValue({
        conversation: createMockConversation({
          endpoint: EModelEndpoint.bedrock,
          model: 'claude-3',
        }),
        setConversation: mockSetConversation,
      });

      mockUseGetEndpointsQuery.mockReturnValue({
        data: {
          bedrock: {
            availableRegions: ['us-east-1', 'us-west-2', 'eu-west-1'],
          },
        },
      });

      paramSettings[EModelEndpoint.bedrock] = [
        {
          key: 'region',
          label: 'Region',
          type: 'string',
          component: ComponentTypes.Dropdown as ComponentType,
          options: [],
        },
      ];

      renderWithState(<Panel />);

      const regionComponent = getMockDynamicComponent().mock.calls.find(
        (call: any) => call[0].settingKey === 'region',
      );
      expect(regionComponent).toBeDefined();
      expect(regionComponent[0].options).toEqual(['us-east-1', 'us-west-2', 'eu-west-1']);
    });
  });

  describe('Parameter Management', () => {
    it('cleans up non-parameter keys from conversation', async () => {
      mockUseChatContext.mockReturnValue({
        conversation: createMockConversation({
          endpoint: EModelEndpoint.openAI,
          model: 'gpt-4',
          temperature: 0.7,
          max_tokens: 1000,
          customKey: 'should-be-removed',
          anotherKey: 'also-removed',
        } as any),
        setConversation: mockSetConversation,
      });

      renderWithState(<Panel />);

      await waitFor(() => {
        expect(mockSetConversation).toHaveBeenCalled();
        const updater = mockSetConversation.mock.calls[0][0];
        const result = updater(mockUseChatContext().conversation);
        expect(result.customKey).toBeUndefined();
        expect(result.anotherKey).toBeUndefined();
        expect(result.temperature).toBe(0.7);
        expect(result.endpoint).toBe(EModelEndpoint.openAI);
      });
    });

    it('preserves excluded keys during cleanup', async () => {
      const conversationWithExcluded = createMockConversation({
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-4',
        temperature: 0.7,
        conversationId: 'keep-this',
        title: 'keep-this-too',
        customKey: 'remove-this',
      } as any);

      mockUseChatContext.mockReturnValue({
        conversation: conversationWithExcluded,
        setConversation: mockSetConversation,
      });

      renderWithState(<Panel />);

      await waitFor(() => {
        const updater = mockSetConversation.mock.calls[0][0];
        const result = updater(conversationWithExcluded);
        expect(result.conversationId).toBe('keep-this');
        expect(result.title).toBe('keep-this-too');
        expect(result.customKey).toBeUndefined();
      });
    });

    it('resets all parameters when reset button is clicked', async () => {
      const conversation = createMockConversation({
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-4',
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 0.9,
        frequency_penalty: 0.5,
      });

      mockUseChatContext.mockReturnValue({
        conversation,
        setConversation: mockSetConversation,
      });

      renderWithState(<Panel />);

      const resetButton = screen.getByRole('button', { name: /reset.*model.*parameters/i });
      fireEvent.click(resetButton);

      await waitFor(() => {
        const resetCall = mockSetConversation.mock.calls.find(
          (call, index) => index > 0 && typeof call[0] === 'function',
        );
        expect(resetCall).toBeDefined();
        const updater = resetCall[0];
        const result = updater(conversation);
        expect(result.temperature).toBeUndefined();
        expect(result.max_tokens).toBeUndefined();
        expect(result.top_p).toBeUndefined();
        expect(result.frequency_penalty).toBeUndefined();
        expect(result.endpoint).toBe(EModelEndpoint.openAI);
        expect(result.model).toBe('gpt-4');
      });
    });
  });

  describe('Save As Preset', () => {
    it('opens dialog with current conversation as preset', async () => {
      const user = userEvent.setup();
      const conversation = createMockConversation({
        conversationId: 'test-conversation-id',
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-4',
        temperature: 0.8,
        max_tokens: 2000,
      });

      mockUseChatContext.mockReturnValue({
        conversation,
        setConversation: mockSetConversation,
      });

      renderWithState(<Panel />);

      const saveButton = screen.getByRole('button', { name: /save.*preset/i });
      await user.click(saveButton);

      expect(screen.getByTestId('save-preset-dialog')).toBeInTheDocument();
      const dialogContent = screen.getByTestId('save-preset-dialog').textContent;
      expect(dialogContent).toContain(EModelEndpoint.openAI);
      expect(dialogContent).toContain('gpt-4');
    });

    it('closes dialog when close button is clicked', async () => {
      const user = userEvent.setup();

      const conversation = createMockConversation({
        conversationId: 'test-conversation-id',
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-4',
        temperature: 0.8,
        max_tokens: 2000,
      });

      mockUseChatContext.mockReturnValue({
        conversation,
        setConversation: mockSetConversation,
      });

      renderWithState(<Panel />);

      const saveButton = screen.getByRole('button', { name: /save.*preset/i });
      await user.click(saveButton);

      expect(screen.getByTestId('save-preset-dialog')).toBeInTheDocument();

      const closeButton = screen.getByLabelText('Close dialog');
      await user.click(closeButton);

      expect(screen.queryByTestId('save-preset-dialog')).not.toBeInTheDocument();
    });
  });

  describe('Dynamic Component Rendering', () => {
    const componentTypes: ComponentType[] = [
      ComponentTypes.Slider,
      ComponentTypes.Dropdown,
      ComponentTypes.Switch,
      ComponentTypes.Textarea,
      ComponentTypes.Input,
      ComponentTypes.Checkbox,
      ComponentTypes.Tags,
      ComponentTypes.Combobox,
    ];

    componentTypes.forEach((componentType) => {
      it(`renders ${componentType} component correctly`, () => {
        paramSettings[EModelEndpoint.openAI] = [
          {
            key: `test_${componentType}`,
            label: `Test ${componentType}`,
            type: 'string',
            component: componentType as ComponentType,
            default: 'default-value',
          },
        ];

        renderWithState(<Panel />);

        expect(screen.getByTestId(`dynamic-test_${componentType}`)).toBeInTheDocument();
      });
    });

    it('passes correct props to dynamic components', () => {
      paramSettings[EModelEndpoint.openAI] = [
        {
          key: 'test_param',
          label: 'Test Parameter',
          description: 'Test description',
          placeholder: 'Enter value',
          type: 'string',
          component: ComponentTypes.Input as ComponentType,
          default: 'default-value',
        },
      ];

      renderWithState(<Panel />);

      const componentCall = getMockDynamicComponent().mock.calls.find(
        (call: any) => call[0].settingKey === 'test_param',
      );

      expect(componentCall[0]).toMatchObject({
        settingKey: 'test_param',
        label: 'Test Parameter',
        description: 'Test description',
        placeholder: 'Enter value',
        defaultValue: 'default-value',
      });
      expect(componentCall[0].setOption).toBe(mockSetOption);
      expect(componentCall[0].conversation).toMatchObject({
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-4',
      });
    });
  });

  describe('Endpoint Type Handling', () => {
    it('falls back to endpoint when type is not available', () => {
      mockUseChatContext.mockReturnValue({
        conversation: createMockConversation({
          endpoint: 'customEndpoint' as EModelEndpoint,
          model: 'custom-model',
        }),
        setConversation: mockSetConversation,
      });

      paramSettings['customEndpoint'] = [
        {
          key: 'custom_param',
          label: 'Custom Parameter',
          type: 'string',
          component: ComponentTypes.Input as ComponentType,
        },
      ];

      renderWithState(<Panel />);

      expect(screen.getByTestId('dynamic-custom_param')).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('returns null when no parameters are defined', () => {
      Object.keys(paramSettings).forEach((key) => {
        delete paramSettings[key];
      });

      mockUseChatContext.mockReturnValue({
        conversation: createMockConversation({
          conversationId: 'test-id',
          endpoint: 'unknown' as EModelEndpoint,
          model: 'unknown-model',
        }),
        setConversation: mockSetConversation,
      });

      const { container } = renderWithState(<Panel />);

      expect(container.firstChild).not.toBeNull();
      expect(screen.getByRole('button', { name: /reset.*model.*parameters/i })).toBeInTheDocument();
      expect(screen.queryByTestId(/dynamic-/)).not.toBeInTheDocument();
    });

    it('skips rendering components not in componentMapping', () => {
      paramSettings[EModelEndpoint.openAI] = [
        {
          key: 'unknown_component',
          label: 'Unknown Component',
          type: 'string',
          component: 'unknownComponent' as ComponentType,
          default: 'default-value',
        },
      ];

      const { container } = renderWithState(<Panel />);

      expect(container.firstChild).not.toBeNull();
      expect(screen.getByRole('button', { name: /reset.*model.*parameters/i })).toBeInTheDocument();
      expect(screen.queryByTestId('dynamic-unknown_component')).not.toBeInTheDocument();
    });

    it('handles undefined endpoint config gracefully', () => {
      mockUseGetEndpointsQuery.mockReturnValue({
        data: undefined,
      });

      renderWithState(<Panel />);

      expect(screen.getByRole('button', { name: /reset.*model.*parameters/i })).toBeInTheDocument();
    });

    it('does not update conversation when setConversation receives null', async () => {
      mockSetConversation.mockImplementation((updater) => {
        if (typeof updater === 'function') {
          return updater(null);
        }
        return updater;
      });

      renderWithState(<Panel />);

      await waitFor(() => {
        expect(mockSetConversation).toHaveBeenCalled();
        const updater = mockSetConversation.mock.calls[0][0];
        const result = updater(null);
        expect(result).toBeNull();
      });
    });

    it('handles reset when conversation is null', () => {
      mockUseChatContext.mockReturnValue({
        conversation: null,
        setConversation: mockSetConversation,
      });

      mockSetConversation.mockImplementation((updater) => {
        if (typeof updater === 'function') {
          return updater(null);
        }
        return updater;
      });

      renderWithState(<Panel />);

      const resetButton = screen.getByRole('button', { name: /reset.*model.*parameters/i });
      fireEvent.click(resetButton);

      const updater = mockSetConversation.mock.calls[0][0];
      const result = updater(null);
      expect(result).toBeNull();
    });
  });
});
