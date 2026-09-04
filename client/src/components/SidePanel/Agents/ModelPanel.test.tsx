/**
 * @jest-environment jsdom
 */
import React from 'react';
import { Providers } from 'librechat-data-provider';
import { FormProvider, useForm } from 'react-hook-form';
import { fireEvent, render } from '@testing-library/react';
import type { TEndpointsConfig } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import ModelPanel from './ModelPanel';

let mockEndpointsConfig: TEndpointsConfig = {};

jest.mock('@librechat/client', () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>,
  Button: ({ children, onClick, type }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type={type} onClick={onClick}>
      {children}
    </button>
  ),
  ControlCombobox: ({
    ariaLabel,
    disabled,
    items,
    selectId,
    selectedValue,
    displayValue,
    selectPlaceholder,
    setValue,
  }: {
    ariaLabel: string;
    disabled?: boolean;
    items: Array<{ label: string; value: string }>;
    selectId?: string;
    selectedValue: string;
    displayValue?: string;
    selectPlaceholder?: string;
    setValue: (value: string) => void;
  }) => (
    <div>
      <button id={selectId} type="button" disabled={disabled} aria-label={ariaLabel}>
        {displayValue || selectedValue || selectPlaceholder}
      </button>
      <span data-testid={`${ariaLabel}-selected`}>{selectedValue}</span>
      <span data-testid={`${ariaLabel}-display`}>{displayValue}</span>
      <span data-testid={`${ariaLabel}-placeholder`}>{selectPlaceholder}</span>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          disabled={disabled}
          data-testid={`${ariaLabel}-${item.value}`}
          onClick={() => setValue(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  ),
}));

jest.mock('~/components/SidePanel/Parameters/components', () => ({
  componentMapping: {},
}));

jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: () => ({ data: mockEndpointsConfig }),
}));

jest.mock('~/Providers', () => ({
  useLiveAnnouncer: () => ({ announcePolite: jest.fn() }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' '),
}));

function TestForm({
  defaultModel = '',
  defaultProvider = '',
  models,
  modelsError = false,
  modelsReady,
  providers = [{ label: 'Custom', value: 'custom' }],
}: {
  defaultModel?: string;
  defaultProvider?: string;
  models: Record<string, string[]>;
  modelsError?: boolean;
  modelsReady: boolean;
  providers?: Array<{ label: string; value: string }>;
}) {
  const methods = useForm<AgentForm>({
    defaultValues: {
      provider: defaultProvider,
      model: defaultModel,
      model_parameters: {},
    },
  });

  return (
    <FormProvider {...methods}>
      <ModelPanel
        providers={providers}
        models={models}
        modelsError={modelsError}
        modelsReady={modelsReady}
        setActivePanel={jest.fn()}
      />
    </FormProvider>
  );
}

describe('ModelPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    mockEndpointsConfig = {};
  });

  it('displays a configured model label while retaining the model id', () => {
    mockEndpointsConfig = {
      custom: { order: 0, modelLabels: { 'custom-model': ' Custom Model ' } },
    };
    const { getByTestId } = render(
      <TestForm
        defaultProvider="custom"
        defaultModel="custom-model"
        models={{ custom: ['custom-model'] }}
        modelsReady={true}
      />,
    );

    expect(getByTestId('com_ui_model-display')).toHaveTextContent('Custom Model');
    expect(getByTestId('com_ui_model-selected')).toHaveTextContent('custom-model');
    expect(getByTestId('com_ui_model-custom-model')).toHaveTextContent('Custom Model');
  });

  it('disables model selection until the model catalogue is ready', () => {
    const { getByTestId } = render(
      <TestForm
        defaultProvider="custom"
        models={{ custom: ['custom-model'] }}
        modelsReady={false}
      />,
    );

    expect(getByTestId('com_ui_provider-custom')).toBeDisabled();
    expect(getByTestId('com_ui_model-custom-model')).toBeDisabled();
  });

  it('selects and saves the first model when the provider changes', () => {
    const providers = [
      { label: 'Original', value: 'original' },
      { label: 'Alternate', value: 'alternate' },
    ];
    const { getByTestId } = render(
      <TestForm
        defaultProvider="original"
        defaultModel="original-model"
        models={{ original: ['original-model'], alternate: ['alternate-model'] }}
        modelsReady={true}
        providers={providers}
      />,
    );

    fireEvent.click(getByTestId('com_ui_provider-alternate'));

    expect(getByTestId('com_ui_model-selected')).toHaveTextContent('alternate-model');
    expect(localStorage.getItem('lastAgentProvider')).toBe('alternate');
    expect(localStorage.getItem('lastAgentModel')).toBe('alternate-model');
  });

  it('selects the Google catalog for a Vertex AI provider', () => {
    const providers = [
      { label: 'Original', value: 'original' },
      { label: 'Vertex AI', value: Providers.VERTEXAI },
    ];
    const { getByTestId } = render(
      <TestForm
        defaultProvider="original"
        defaultModel="original-model"
        models={{ original: ['original-model'], google: ['gemini-3.7-flash'] }}
        modelsReady={true}
        providers={providers}
      />,
    );

    fireEvent.click(getByTestId(`com_ui_provider-${Providers.VERTEXAI}`));

    expect(getByTestId('com_ui_model-selected')).toHaveTextContent('gemini-3.7-flash');
    expect(localStorage.getItem('lastAgentProvider')).toBe(Providers.VERTEXAI);
    expect(localStorage.getItem('lastAgentModel')).toBe('gemini-3.7-flash');
  });

  it('selects an exact Vertex AI catalog when configured', () => {
    const providers = [
      { label: 'Original', value: 'original' },
      { label: 'Vertex AI', value: Providers.VERTEXAI },
    ];
    const { getByTestId } = render(
      <TestForm
        defaultProvider="original"
        defaultModel="original-model"
        models={{
          original: ['original-model'],
          google: ['gemini-3.7-flash'],
          [Providers.VERTEXAI]: ['custom-vertex-model'],
        }}
        modelsReady={true}
        providers={providers}
      />,
    );

    fireEvent.click(getByTestId(`com_ui_provider-${Providers.VERTEXAI}`));

    expect(getByTestId('com_ui_model-selected')).toHaveTextContent('custom-vertex-model');
    expect(localStorage.getItem('lastAgentProvider')).toBe(Providers.VERTEXAI);
    expect(localStorage.getItem('lastAgentModel')).toBe('custom-vertex-model');
  });

  it('preserves the model when the current provider is selected again', () => {
    const { getByTestId } = render(
      <TestForm
        defaultProvider="custom"
        defaultModel="second-model"
        models={{ custom: ['first-model', 'second-model'] }}
        modelsReady={true}
      />,
    );

    fireEvent.click(getByTestId('com_ui_provider-custom'));

    expect(getByTestId('com_ui_model-selected')).toHaveTextContent('second-model');
  });

  it('saves an explicitly selected model', () => {
    const { getByTestId } = render(
      <TestForm
        defaultProvider="custom"
        defaultModel="first-model"
        models={{ custom: ['first-model', 'second-model'] }}
        modelsReady={true}
      />,
    );

    fireEvent.click(getByTestId('com_ui_model-second-model'));

    expect(localStorage.getItem('lastAgentProvider')).toBe('custom');
    expect(localStorage.getItem('lastAgentModel')).toBe('second-model');
  });

  it('announces the pending catalogue instead of inviting a selection', () => {
    const { getByTestId } = render(
      <TestForm defaultProvider="custom" models={{}} modelsReady={false} />,
    );

    expect(getByTestId('com_ui_model-placeholder')).toHaveTextContent('com_ui_loading');
  });

  it('offers no models and explains the failure when the catalogue cannot be loaded', () => {
    const { getByRole, getByTestId, queryByTestId } = render(
      <TestForm defaultProvider="custom" models={{}} modelsError={true} modelsReady={true} />,
    );

    expect(getByRole('alert')).toHaveTextContent('com_error_models_not_loaded');
    expect(queryByTestId('com_ui_model-placeholder')).toHaveTextContent('com_ui_select_model');
    expect(getByTestId('com_ui_provider-custom')).toBeDisabled();
  });

  it('labels the provider and model controls', () => {
    const { container } = render(
      <TestForm
        defaultProvider="custom"
        models={{ custom: ['custom-model'] }}
        modelsReady={true}
      />,
    );

    expect(container.querySelector('label[for="provider"]')).not.toBeNull();
    expect(container.querySelector('label[for="model"]')).not.toBeNull();
    expect(container.querySelector('#provider')).not.toBeNull();
    expect(container.querySelector('#model')).not.toBeNull();
  });
});
