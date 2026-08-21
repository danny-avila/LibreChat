/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import type { AgentForm } from '~/common';
import ModelPanel from './ModelPanel';

jest.mock('@librechat/client', () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>,
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  ControlCombobox: ({
    ariaLabel,
    disabled,
    selectId,
    selectPlaceholder,
  }: {
    ariaLabel: string;
    disabled?: boolean;
    selectId?: string;
    selectPlaceholder?: string;
  }) => (
    <button id={selectId} type="button" aria-label={ariaLabel} disabled={disabled}>
      {selectPlaceholder}
    </button>
  ),
}));

jest.mock('~/components/SidePanel/Parameters/components', () => ({ componentMapping: {} }));
jest.mock('~/data-provider', () => ({ useGetEndpointsQuery: () => ({ data: {} }) }));
jest.mock('~/Providers', () => ({
  useLiveAnnouncer: () => ({ announcePolite: jest.fn() }),
}));
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('~/common', () => ({ Panel: { builder: 'builder' } }));
jest.mock('~/utils', () => ({
  cn: (...values: Array<string | false | undefined>) => values.filter(Boolean).join(' '),
}));

function ModelPanelHarness({
  models,
  modelsError = false,
  modelsLoaded,
}: {
  models: Record<string, string[]>;
  modelsError?: boolean;
  modelsLoaded: boolean;
}) {
  const methods = useForm<AgentForm>({
    defaultValues: {
      provider: 'openAI',
      model: 'fallback-model',
      model_parameters: {},
    },
  });
  const selectedModel = useWatch({ control: methods.control, name: 'model' });

  return (
    <FormProvider {...methods}>
      <span data-testid="selected-model">{selectedModel}</span>
      <ModelPanel
        models={models}
        modelsError={modelsError}
        modelsLoaded={modelsLoaded}
        providers={[{ label: 'OpenAI', value: 'openAI' }]}
        setActivePanel={jest.fn()}
      />
    </FormProvider>
  );
}

describe('ModelPanel model availability', () => {
  it('preserves the selected model until authoritative models load', async () => {
    const { rerender } = render(<ModelPanelHarness models={{}} modelsLoaded={false} />);

    expect(screen.getByTestId('selected-model')).toHaveTextContent('fallback-model');
    expect(screen.getByRole('button', { name: 'com_ui_model' })).toBeDisabled();
    expect(document.querySelector('label[for="provider"]')).toHaveAttribute('for', 'provider');
    expect(document.querySelector('label[for="model"]')).toHaveAttribute('for', 'model');
    expect(document.getElementById('provider')).toBeInTheDocument();
    expect(document.getElementById('model')).toBeInTheDocument();

    rerender(<ModelPanelHarness models={{}} modelsError={true} modelsLoaded={false} />);

    expect(screen.getByTestId('selected-model')).toHaveTextContent('fallback-model');
    expect(screen.getByRole('alert')).toHaveTextContent('com_error_models_not_loaded');
    expect(screen.getByRole('button', { name: 'com_ui_model' })).toBeDisabled();

    rerender(<ModelPanelHarness models={{ openAI: ['configured-model'] }} modelsLoaded={true} />);

    await waitFor(() => {
      expect(screen.getByTestId('selected-model')).toHaveTextContent('configured-model');
    });
    expect(screen.getByRole('button', { name: 'com_ui_model' })).toBeEnabled();
  });

  it('disables provider selection while model reconciliation is paused', async () => {
    const { rerender } = render(<ModelPanelHarness models={{}} modelsLoaded={false} />);

    expect(screen.getByRole('button', { name: 'com_ui_provider' })).toBeDisabled();

    rerender(<ModelPanelHarness models={{}} modelsError={true} modelsLoaded={false} />);

    expect(screen.getByRole('button', { name: 'com_ui_provider' })).toBeDisabled();

    rerender(<ModelPanelHarness models={{ openAI: ['configured-model'] }} modelsLoaded={true} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'com_ui_provider' })).toBeEnabled();
    });
  });
});
