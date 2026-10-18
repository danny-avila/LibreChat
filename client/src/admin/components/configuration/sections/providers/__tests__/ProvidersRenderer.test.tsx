import { fireEvent, render, screen } from '@testing-library/react';
import type * as t from '~/admin/types';
import { ProvidersRenderer } from '../ProvidersRenderer';
import { createField } from '~/admin/test/fixtures';

jest.mock('~/admin/hooks/useLocalize', () => ({
  default: () => (key: string) => key,
  useLocalize: () => (key: string) => key,
}));

interface MockTextFieldProps {
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

jest.mock('~/admin/ui', () => ({
  Icon: () => <span />,
  MultiAccordion: Object.assign(
    ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    {
      Item: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    },
  ),
  TextField: ({ id, value, onChange, disabled, ...rest }: MockTextFieldProps) => (
    <input
      id={id}
      value={value ?? ''}
      disabled={disabled}
      aria-label={rest['aria-label']}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

const noop = () => {};
const getValue = (_path: string, fallback: t.ConfigValue) => fallback;
/** Provider sections are collapsible cards that start closed when nothing is configured. */
const expandOpenAI = () =>
  fireEvent.click(screen.getByRole('button', { name: /com_admin_config_field_openAI/ }));

describe('ProvidersRenderer', () => {
  const providerFields: t.SchemaField[] = [
    createField({
      key: 'openAI',
      children: [createField({ key: 'apiKey', type: 'string' })],
    }),
  ];

  it('renders a masked secret for a provider apiKey with a display companion', () => {
    render(
      <ProvidersRenderer
        fields={providerFields}
        parentValue={{ openAI: { apiKeyPreview: 'sk-test...1234' } }}
        parentPath="endpoints"
        getValue={getValue}
        onChange={noop}
      />,
    );
    expandOpenAI();
    expect(screen.getByDisplayValue('sk-test...1234')).toBeDisabled();
  });

  it('shows a normal editable input for a provider apiKey while its reset is pending', () => {
    render(
      <ProvidersRenderer
        fields={providerFields}
        parentValue={{ openAI: { apiKeyPreview: 'sk-test...1234' } }}
        parentPath="endpoints"
        getValue={getValue}
        onChange={noop}
        pendingResets={new Set(['endpoints.openAI.apiKey'])}
      />,
    );
    expandOpenAI();
    expect(screen.queryByDisplayValue('sk-test...1234')).not.toBeInTheDocument();
    expect(screen.getByLabelText('apiKey')).not.toBeDisabled();
  });

  it('forwards editedValues so a cleared-but-queued provider secret stays visible after remount', () => {
    render(
      <ProvidersRenderer
        fields={providerFields}
        parentValue={{ openAI: { apiKeyPreview: 'sk-test...1234' } }}
        parentPath="endpoints"
        getValue={getValue}
        onChange={noop}
        touchedPaths={new Set(['endpoints.openAI.apiKey'])}
        editedValues={{ 'endpoints.openAI.apiKey': '' }}
      />,
    );
    expandOpenAI();
    expect(screen.queryByDisplayValue('sk-test...1234')).not.toBeInTheDocument();
    expect(screen.getByLabelText('apiKey')).not.toBeDisabled();
  });
});
