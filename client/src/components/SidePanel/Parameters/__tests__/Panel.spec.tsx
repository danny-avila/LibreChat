import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TConversation, ComponentType } from 'librechat-data-provider';
import { paramSettings, ComponentTypes } from 'librechat-data-provider';
import Panel from '../Panel';

const mockSetConversation = jest.fn();
const mockSetOption = jest.fn();
const mockLocalize = jest.fn((key: string, values?: Record<string, string>) => {
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
});

jest.mock('~/Providers', () => ({
  useChatContext: jest.fn(() => ({
    conversation: {
      endpoint: 'openAI',
      model: 'gpt-4',
      temperature: 0.7,
      max_tokens: 1000,
    } as TConversation,
    setConversation: mockSetConversation,
  })),
}));

jest.mock('~/hooks', () => ({
  useSetIndexOptions: jest.fn(() => ({
    setOption: mockSetOption,
  })),
  useLocalize: jest.fn(() => mockLocalize),
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

    paramSettings['openAI'] = [
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
      render(<Panel />);

      expect(screen.getByText('Temperature')).toBeInTheDocument();
      expect(screen.getByText('Max Tokens')).toBeInTheDocument();
      expect(screen.getByTestId('dynamic-temperature')).toBeInTheDocument();
      expect(screen.getByTestId('dynamic-max_tokens')).toBeInTheDocument();
    });

    it('renders reset and save preset buttons', () => {
      render(<Panel />);

      expect(screen.getByText('Reset Model Parameters')).toBeInTheDocument();
      expect(screen.getByText('Save As Preset')).toBeInTheDocument();
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

      render(<Panel />);

      expect(screen.getByText('Custom Temperature')).toBeInTheDocument();
    });

    it('renders with Bedrock regions when available', () => {
      mockUseChatContext.mockReturnValue({
        conversation: {
          endpoint: 'bedrock',
          model: 'claude-3',
        },
        setConversation: mockSetConversation,
      });

      mockUseGetEndpointsQuery.mockReturnValue({
        data: {
          bedrock: {
            availableRegions: ['us-east-1', 'us-west-2', 'eu-west-1'],
          },
        },
      });

      paramSettings['bedrock'] = [
        {
          key: 'region',
          label: 'Region',
          type: 'string',
          component: ComponentTypes.Dropdown as ComponentType,
          options: [],
        },
      ];

      render(<Panel />);

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
        conversation: {
          endpoint: 'openAI',
          model: 'gpt-4',
          temperature: 0.7,
          max_tokens: 1000,
          customKey: 'should-be-removed',
          anotherKey: 'also-removed',
        },
        setConversation: mockSetConversation,
      });

      render(<Panel />);

      await waitFor(() => {
        expect(mockSetConversation).toHaveBeenCalled();
        const updater = mockSetConversation.mock.calls[0][0];
        const result = updater(mockUseChatContext().conversation);
        expect(result.customKey).toBeUndefined();
        expect(result.anotherKey).toBeUndefined();
        expect(result.temperature).toBe(0.7);
        expect(result.endpoint).toBe('openAI');
      });
    });

    it('preserves excluded keys during cleanup', async () => {
      const conversationWithExcluded = {
        endpoint: 'openAI',
        model: 'gpt-4',
        temperature: 0.7,
        conversationId: 'keep-this',
        title: 'keep-this-too',
        customKey: 'remove-this',
      };

      mockUseChatContext.mockReturnValue({
        conversation: conversationWithExcluded,
        setConversation: mockSetConversation,
      });

      render(<Panel />);

      await waitFor(() => {
        const updater = mockSetConversation.mock.calls[0][0];
        const result = updater(conversationWithExcluded);
        expect(result.conversationId).toBe('keep-this');
        expect(result.title).toBe('keep-this-too');
        expect(result.customKey).toBeUndefined();
      });
    });

    it('resets all parameters when reset button is clicked', async () => {
      const conversation = {
        endpoint: 'openAI',
        model: 'gpt-4',
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 0.9,
        frequency_penalty: 0.5,
      };

      mockUseChatContext.mockReturnValue({
        conversation,
        setConversation: mockSetConversation,
      });

      render(<Panel />);

      const resetButton = screen.getByText('Reset Model Parameters');
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
        expect(result.endpoint).toBe('openAI');
        expect(result.model).toBe('gpt-4');
      });
    });
  });

  describe('Save As Preset', () => {
    it('opens dialog with current conversation as preset', async () => {
      const user = userEvent.setup();
      const conversation = {
        conversationId: 'test-conversation-id',
        endpoint: 'openAI',
        model: 'gpt-4',
        temperature: 0.8,
        max_tokens: 2000,
      };

      mockUseChatContext.mockReturnValue({
        conversation,
        setConversation: mockSetConversation,
      });

      render(<Panel />);

      const saveButton = screen.getByText('Save As Preset');
      await user.click(saveButton);

      expect(screen.getByTestId('save-preset-dialog')).toBeInTheDocument();
      const dialogContent = screen.getByTestId('save-preset-dialog').textContent;
      expect(dialogContent).toContain('openAI');
      expect(dialogContent).toContain('gpt-4');
    });

    it('closes dialog when close button is clicked', async () => {
      const user = userEvent.setup();

      const conversation = {
        conversationId: 'test-conversation-id',
        endpoint: 'openAI',
        model: 'gpt-4',
        temperature: 0.8,
        max_tokens: 2000,
      };

      mockUseChatContext.mockReturnValue({
        conversation,
        setConversation: mockSetConversation,
      });

      render(<Panel />);

      const saveButton = screen.getByText('Save As Preset');
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
        paramSettings['openAI'] = [
          {
            key: `test_${componentType}`,
            label: `Test ${componentType}`,
            type: 'string',
            component: componentType as ComponentType,
            default: 'default-value',
          },
        ];

        render(<Panel />);

        expect(screen.getByTestId(`dynamic-test_${componentType}`)).toBeInTheDocument();
        expect(screen.getByText(`Test ${componentType}`)).toBeInTheDocument();
      });
    });

    it('passes correct props to dynamic components', () => {
      paramSettings['openAI'] = [
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

      render(<Panel />);

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
        endpoint: 'openAI',
        model: 'gpt-4',
      });
    });
  });

  describe('Endpoint Type Handling', () => {
    it('uses endpoint type for parameter lookup when available', () => {
      mockUseChatContext.mockReturnValue({
        conversation: {
          endpoint: 'azureOpenAI',
          model: 'gpt-4',
        },
        setConversation: mockSetConversation,
      });

      paramSettings['azure'] = [
        {
          key: 'azure_param',
          label: 'Azure Parameter',
          type: 'string',
          component: ComponentTypes.Input as ComponentType,
        },
      ];

      render(<Panel />);

      expect(screen.getByText('Azure Parameter')).toBeInTheDocument();
    });

    it('falls back to endpoint when type is not available', () => {
      mockUseChatContext.mockReturnValue({
        conversation: {
          endpoint: 'customEndpoint',
          model: 'custom-model',
        },
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

      render(<Panel />);

      expect(screen.getByText('Custom Parameter')).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('returns null when no parameters are defined', () => {
      Object.keys(paramSettings).forEach((key) => {
        delete paramSettings[key];
      });

      mockUseChatContext.mockReturnValue({
        conversation: {
          conversationId: 'test-id',
          endpoint: 'unknown',
          model: 'unknown-model',
        },
        setConversation: mockSetConversation,
      });

      const { container } = render(<Panel />);

      expect(container.firstChild).not.toBeNull();
      expect(screen.getByText('Reset Model Parameters')).toBeInTheDocument();
      expect(screen.queryByTestId(/dynamic-/)).not.toBeInTheDocument();
    });

    it('handles null conversation gracefully', () => {
      paramSettings[''] = [];

      mockUseChatContext.mockReturnValue({
        conversation: null,
        setConversation: mockSetConversation,
      });

      const { container } = render(<Panel />);

      expect(container.firstChild).not.toBeNull();
      expect(screen.getByText('Reset Model Parameters')).toBeInTheDocument();
    });

    it('skips rendering components not in componentMapping', () => {
      const { container } = render(<Panel />);

      expect(container.firstChild).not.toBeNull();
      expect(screen.getByText('Reset Model Parameters')).toBeInTheDocument();
      expect(screen.queryByTestId(/dynamic-/)).not.toBeInTheDocument();
    });

    it('handles undefined endpoint config gracefully', () => {
      mockUseGetEndpointsQuery.mockReturnValue({
        data: undefined,
      });

      render(<Panel />);

      expect(screen.getByText('Reset Model Parameters')).toBeInTheDocument();
    });

    it('handles missing customParams in endpoint config', () => {
      mockUseGetEndpointsQuery.mockReturnValue({
        data: {
          openAI: {},
        },
      });

      const { container } = render(<Panel />);

      expect(container.firstChild).not.toBeNull();
      expect(screen.getByText('Reset Model Parameters')).toBeInTheDocument();
    });

    it('does not update conversation when setConversation receives null', async () => {
      mockSetConversation.mockImplementation((updater) => {
        if (typeof updater === 'function') {
          return updater(null);
        }
        return updater;
      });

      render(<Panel />);

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

      render(<Panel />);

      const resetButton = screen.getByText('Reset Model Parameters');
      fireEvent.click(resetButton);

      const updater = mockSetConversation.mock.calls[0][0];
      const result = updater(null);
      expect(result).toBeNull();
    });
  });
});
