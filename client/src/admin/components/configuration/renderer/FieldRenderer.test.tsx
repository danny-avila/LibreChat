import { render, screen, fireEvent } from '@testing-library/react';
import { SingleFieldRenderer, FieldRenderer, renderInlineField } from '.';
import type * as t from '~/admin/types';
import { ConfigValuesProvider } from '~/admin/contexts/ConfigValuesContext';
import { RowFilterContext } from '~/admin/contexts/RowFilterContext';
import { createField } from '~/admin/test/fixtures';
import { createPathIndex } from '~/admin/utils';

jest.mock('~/admin/hooks/useLocalize', () => ({
  default: () => (key: string) => key,
  useLocalize: () => (key: string) => key,
}));

interface MockSwitchProps {
  checked: boolean;
  'aria-label'?: string;
  onCheckedChange?: (checked: boolean) => void;
}
interface MockSelectProps {
  children: React.ReactNode;
  value: string;
  'aria-label'?: string;
}
interface MockSelectItemProps {
  children: React.ReactNode;
  value: string;
}
interface MockIconProps {
  name: string;
}
interface MockButtonProps {
  label: string;
  onClick?: () => void;
}
interface MockTextFieldProps {
  id?: string;
  value?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  type?: string;
  disabled?: boolean;
  'aria-label'?: string;
}
interface MockNumberFieldProps {
  id?: string;
  value?: string | number;
  placeholder?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}
interface MockIconButtonProps {
  icon: string;
  onClick?: () => void;
  'aria-label'?: string;
}

jest.mock('~/admin/ui', () => ({
  Switch: (props: MockSwitchProps) => (
    <button
      role="switch"
      aria-checked={props.checked}
      aria-label={props['aria-label']}
      data-testid="toggle"
      onClick={() => props.onCheckedChange?.(!props.checked)}
    />
  ),
  Select: Object.assign(
    ({ children, value, ...props }: MockSelectProps) => (
      <div data-testid="select" data-value={value} aria-label={props['aria-label']}>
        {children}
      </div>
    ),
    {
      Item: ({ children, value }: MockSelectItemProps) => (
        <div data-testid="select-item" data-value={value}>
          {children}
        </div>
      ),
    },
  ),
  Icon: ({ name }: MockIconProps) => <span data-testid={`icon-${name}`} />,
  Button: ({ label, onClick }: MockButtonProps) => <button onClick={onClick}>{label}</button>,
  IconButton: ({ icon, onClick, ...props }: MockIconButtonProps) => (
    <button
      onClick={onClick}
      aria-label={props['aria-label'] ?? icon}
      data-testid={`icon-button-${icon}`}
    />
  ),
  TextField: ({
    id,
    value,
    placeholder,
    onChange,
    onBlur,
    type,
    disabled,
    ...rest
  }: MockTextFieldProps) => (
    <input
      id={id}
      value={value ?? ''}
      placeholder={placeholder}
      type={type ?? 'text'}
      disabled={disabled}
      aria-label={rest['aria-label']}
      onChange={(e) => onChange?.(e.target.value)}
      onBlur={onBlur}
    />
  ),
  NumberField: ({ id, value, placeholder, onChange, onBlur }: MockNumberFieldProps) => (
    <input
      id={id}
      value={value ?? ''}
      placeholder={placeholder}
      type="number"
      onChange={(e) => onChange?.(e.target.value)}
      onBlur={onBlur}
    />
  ),
}));

const noop = () => {};
const getSecretInput = () => {
  const input = document.querySelector<HTMLInputElement>('input[type="password"]');
  if (!input) throw new Error('no secret input');
  return input;
};
const getValue = (_path: string, fallback: t.ConfigValue) => fallback;

describe('SingleFieldRenderer', () => {
  it('renders a toggle for boolean fields', () => {
    const field = createField({ key: 'enabled', type: 'boolean' });
    render(
      <SingleFieldRenderer
        field={field}
        value={true}
        path="section.enabled"
        getValue={getValue}
        onChange={noop}
      />,
    );
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('renders a select for enum fields with correct options', () => {
    const field = createField({ key: 'theme', type: 'enum(dark | light | system)' });
    render(
      <SingleFieldRenderer
        field={field}
        value="dark"
        path="section.theme"
        getValue={getValue}
        onChange={noop}
      />,
    );
    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('dark');
    const items = screen.getAllByRole('option');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Dark');
    expect(items[1]).toHaveTextContent('Light');
    expect(items[2]).toHaveTextContent('System');
  });

  it('renders a text input for string fields', () => {
    const field = createField({ key: 'title', type: 'string' });
    render(
      <SingleFieldRenderer
        field={field}
        value="Hello"
        path="section.title"
        getValue={getValue}
        onChange={noop}
      />,
    );
    expect(screen.getByRole('textbox')).toHaveValue('Hello');
  });

  it('renders a number input for number fields', () => {
    const field = createField({ key: 'port', type: 'number' });
    render(
      <SingleFieldRenderer
        field={field}
        value={3000}
        path="section.port"
        getValue={getValue}
        onChange={noop}
      />,
    );
    expect(screen.getByRole('spinbutton')).toHaveValue(3000);
  });

  it('renders a list for array<string> fields', () => {
    const field = createField({ key: 'domains', type: 'array<string>', isArray: true });
    render(
      <SingleFieldRenderer
        field={field}
        value={['example.com', 'test.org']}
        path="section.domains"
        getValue={getValue}
        onChange={noop}
      />,
    );
    expect(screen.getByDisplayValue('example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('test.org')).toBeInTheDocument();
  });

  it('keeps earlier pending removals when the last item of a librechat.yaml list is removed', () => {
    const field = createField({ key: 'voices', type: 'array<string>', isArray: true });
    const onChange = jest.fn();
    const onDiscardField = jest.fn();
    render(
      <SingleFieldRenderer
        field={field}
        value={['shimmer']}
        path="speech.voices"
        getValue={getValue}
        onChange={onChange}
        onDiscardField={onDiscardField}
        editedValues={{ 'speech.voices': ['shimmer'] }}
        configuredPaths={new Set(['speech.voices'])}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'com_admin_ui_delete shimmer' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(onDiscardField).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('shimmer')).toBeInTheDocument();
    expect(screen.getByText('com_admin_config_ctl_clear_unavailable')).toBeInTheDocument();
  });

  it('renders key-value pairs for record fields', () => {
    const field = createField({ key: 'headers', type: 'record' });
    render(
      <SingleFieldRenderer
        field={field}
        value={{ Authorization: 'Bearer token' }}
        path="section.headers"
        getValue={getValue}
        onChange={noop}
      />,
    );
    expect(screen.getByDisplayValue('Authorization')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Bearer token')).toBeInTheDocument();
  });
});

describe('FieldRenderer under the tab filter', () => {
  const fields = [
    createField({ key: 'title', type: 'string', path: 'interface.title' }),
    createField({
      key: 'privacyPolicy',
      type: 'object',
      isObject: true,
      path: 'interface.privacyPolicy',
      children: [
        createField({
          key: 'externalUrl',
          type: 'string',
          path: 'interface.privacyPolicy.externalUrl',
        }),
        createField({ key: 'label', type: 'string', path: 'interface.privacyPolicy.label' }),
      ],
    }),
  ];
  const renderFiltered = (paths: string[]) =>
    render(
      <RowFilterContext.Provider value={createPathIndex(paths)}>
        <FieldRenderer
          fields={fields}
          parentValue={{}}
          parentPath="interface"
          getValue={getValue}
          onChange={noop}
        />
      </RowFilterContext.Provider>,
    );

  it('shows only matching rows, opening the group that holds one', () => {
    renderFiltered(['interface.privacyPolicy.externalUrl']);
    expect(document.getElementById('interface-title')).toBeNull();
    expect(document.getElementById('interface-privacyPolicy-externalUrl')).not.toBeNull();
    expect(document.getElementById('interface-privacyPolicy-label')).toBeNull();
  });

  it('shows every row of a group whose own label matched', () => {
    renderFiltered(['interface.privacyPolicy']);
    expect(document.getElementById('interface-privacyPolicy-externalUrl')).not.toBeNull();
    expect(document.getElementById('interface-privacyPolicy-label')).not.toBeNull();
  });
});

describe('FieldRenderer with imported config values', () => {
  it('populates fields from a config values object', () => {
    const fields = [
      createField({ key: 'title', type: 'string', path: 'interface.title' }),
      createField({ key: 'port', type: 'number', path: 'interface.port' }),
      createField({ key: 'enabled', type: 'boolean', path: 'interface.enabled' }),
    ];
    const configValues = { title: 'My App', port: 8080, enabled: true };
    const editedValues: Record<string, t.ConfigValue> = {};
    const getValueWithEdits = (path: string, fallback: t.ConfigValue) =>
      path in editedValues ? editedValues[path] : fallback;

    render(
      <FieldRenderer
        fields={fields}
        parentValue={configValues}
        parentPath="interface"
        getValue={getValueWithEdits}
        onChange={noop}
      />,
    );

    expect(screen.getByRole('textbox')).toHaveValue('My App');
    expect(screen.getByRole('spinbutton')).toHaveValue(8080);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('edited values take precedence over imported values', () => {
    const fields = [createField({ key: 'title', type: 'string', path: 'section.title' })];
    const configValues = { title: 'Original' };
    const editedValues: Record<string, t.ConfigValue> = { 'section.title': 'Edited' };
    const getValueWithEdits = (path: string, fallback: t.ConfigValue) =>
      path in editedValues ? editedValues[path] : fallback;

    render(
      <FieldRenderer
        fields={fields}
        parentValue={configValues}
        parentPath="section"
        getValue={getValueWithEdits}
        onChange={noop}
      />,
    );

    expect(screen.getByRole('textbox')).toHaveValue('Edited');
  });
});

describe('schema evolution: new fields render dynamically', () => {
  it('a new string field added to the schema renders a text input', () => {
    const v1Fields = [createField({ key: 'title', type: 'string', path: 'section.title' })];
    const v2Fields = [
      ...v1Fields,
      createField({ key: 'subtitle', type: 'string', path: 'section.subtitle' }),
    ];

    const { unmount } = render(
      <FieldRenderer
        fields={v1Fields}
        parentValue={{}}
        parentPath="section"
        getValue={getValue}
        onChange={noop}
      />,
    );
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    unmount();

    render(
      <FieldRenderer
        fields={v2Fields}
        parentValue={{}}
        parentPath="section"
        getValue={getValue}
        onChange={noop}
      />,
    );
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });

  it('a new boolean field renders a toggle without code changes', () => {
    const fields = [
      createField({ key: 'existing', type: 'string', path: 'section.existing' }),
      createField({ key: 'newFeatureFlag', type: 'boolean', path: 'section.newFeatureFlag' }),
    ];

    render(
      <FieldRenderer
        fields={fields}
        parentValue={{}}
        parentPath="section"
        getValue={getValue}
        onChange={noop}
      />,
    );
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('a new enum field renders a select with correct options', () => {
    const fields = [
      createField({
        key: 'newMode',
        type: 'enum(fast | balanced | quality)',
        path: 'section.newMode',
      }),
    ];

    render(
      <FieldRenderer
        fields={fields}
        parentValue={{ newMode: 'fast' }}
        parentPath="section"
        getValue={getValue}
        onChange={noop}
      />,
    );
    const items = screen.getAllByRole('option');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Fast');
    expect(items[1]).toHaveTextContent('Balanced');
    expect(items[2]).toHaveTextContent('Quality');
  });

  it('a new nested object field renders its children recursively', () => {
    const fields = [
      createField({
        key: 'newSection',
        type: 'object',
        isObject: true,
        path: 'root.newSection',
        children: [
          createField({ key: 'name', type: 'string', path: 'root.newSection.name' }),
          createField({ key: 'count', type: 'number', path: 'root.newSection.count' }),
        ],
      }),
    ];

    render(
      <FieldRenderer
        fields={fields}
        parentValue={{ newSection: { name: 'Test', count: 42 } }}
        parentPath="root"
        getValue={getValue}
        onChange={noop}
      />,
    );
    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.click(toggle);
    expect(screen.getByRole('textbox')).toHaveValue('Test');
    expect(screen.getByRole('spinbutton')).toHaveValue(42);
  });
});

describe('SingleFieldRenderer onChange interactions', () => {
  it('calls onChange with updated value when text input changes', () => {
    const onChange = jest.fn();
    const field = createField({ key: 'title', type: 'string' });
    render(
      <SingleFieldRenderer
        field={field}
        value="old"
        path="s.title"
        getValue={getValue}
        onChange={onChange}
      />,
    );
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'new' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('s.title', 'new');
  });

  it('calls onChange with updated value when number input changes', () => {
    const onChange = jest.fn();
    const field = createField({ key: 'port', type: 'number' });
    render(
      <SingleFieldRenderer
        field={field}
        value={3000}
        path="s.port"
        getValue={getValue}
        onChange={onChange}
      />,
    );
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '8080' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('s.port', 8080);
  });

  it('calls onChange with toggled value when switch is clicked', () => {
    const onChange = jest.fn();
    const field = createField({ key: 'enabled', type: 'boolean' });
    render(
      <SingleFieldRenderer
        field={field}
        value={false}
        path="s.enabled"
        getValue={getValue}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith('s.enabled', true);
  });
});

describe('masked secret fields', () => {
  const secretFields = [createField({ key: 'apiKey', type: 'string', path: 'ocr.apiKey' })];
  const maskedParent = { apiKeyPreview: 'sk-mist...4321' };

  const renderMasked = (onChange = noop, extra: Partial<t.FieldRendererProps> = {}) =>
    render(
      <FieldRenderer
        fields={secretFields}
        parentValue={maskedParent}
        parentPath="ocr"
        getValue={getValue}
        onChange={onChange}
        {...extra}
      />,
    );

  it('renders the masked display read-only when the display companion is set', () => {
    const onChange = jest.fn();
    renderMasked(onChange);
    const masked = screen.getByDisplayValue('sk-mist...4321');
    expect(masked).toBeDisabled();
    expect(screen.getByText('com_admin_config_secret_replace')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders a normal empty input when no display companion is set', () => {
    render(
      <FieldRenderer
        fields={secretFields}
        parentValue={{}}
        parentPath="ocr"
        getValue={getValue}
        onChange={noop}
      />,
    );
    expect(getSecretInput()).not.toBeDisabled();
    expect(screen.queryByText('com_admin_config_secret_replace')).not.toBeInTheDocument();
  });

  it('replace flow submits only the newly typed secret, never the masked value', () => {
    const onChange = jest.fn();
    renderMasked(onChange);
    fireEvent.click(screen.getByText('com_admin_config_secret_replace'));
    const input = getSecretInput();
    expect(input).not.toBeDisabled();
    expect(input).toHaveValue('');
    fireEvent.change(input, { target: { value: 'brand-new-secret' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('ocr.apiKey', 'brand-new-secret');
  });

  it('cancelling the replace flow discards the field directly, never through onChange', () => {
    const onChange = jest.fn();
    const onDiscardField = jest.fn();
    renderMasked(onChange, { onDiscardField });
    fireEvent.click(screen.getByText('com_admin_config_secret_replace'));
    fireEvent.click(screen.getByText('com_admin_ui_cancel'));
    expect(onChange).not.toHaveBeenCalled();
    expect(onDiscardField).toHaveBeenCalledWith('ocr.apiKey');
    expect(screen.getByDisplayValue('sk-mist...4321')).toBeDisabled();
  });

  it('shows the normal input while a reset is pending', () => {
    renderMasked(noop, { pendingResets: new Set(['ocr.apiKey']) });
    expect(screen.queryByDisplayValue('sk-mist...4321')).not.toBeInTheDocument();
    expect(getSecretInput()).not.toBeDisabled();
  });

  it('keeps the reset affordance for a masked db-overridden secret', () => {
    const onResetField = jest.fn();
    renderMasked(noop, {
      dbOverridePaths: new Set(['ocr.apiKey']),
      configuredPaths: new Set(['ocr.apiKey']),
      permissions: { canView: true, canEdit: true, canAssign: false },
      onResetField,
    });
    fireEvent.click(screen.getByText('com_admin_ui_reset'));
    expect(onResetField).toHaveBeenCalledWith('ocr.apiKey');
  });

  it('shows the masked value as text, with no replace button, when the field is disabled', () => {
    renderMasked(noop, { disabled: true });
    expect(screen.getByText('sk-mist...4321')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText('com_admin_config_secret_replace')).not.toBeInTheDocument();
  });

  it('keeps a cleared replacement visible after remount instead of showing the stale mask', () => {
    renderMasked(noop, { editedValues: { 'ocr.apiKey': '' } });
    expect(screen.queryByDisplayValue('sk-mist...4321')).not.toBeInTheDocument();
    const input = getSecretInput();
    expect(input).not.toBeDisabled();
    expect(input).toHaveValue('');
  });

  it('does not reopen a cleared replacement once it drops out of editedValues as a baseline match', () => {
    renderMasked(noop, { touchedPaths: new Set(['ocr.apiKey']) });
    expect(screen.getByDisplayValue('sk-mist...4321')).toBeDisabled();
    expect(screen.getByText('com_admin_config_secret_replace')).toBeInTheDocument();
  });

  it('an untyped Replace click does not survive a bumped editSessionId', () => {
    const { rerender } = renderMasked(noop, { editSessionId: 0 });
    fireEvent.click(screen.getByText('com_admin_config_secret_replace'));
    expect(getSecretInput()).not.toBeDisabled();

    rerender(
      <FieldRenderer
        fields={secretFields}
        parentValue={maskedParent}
        parentPath="ocr"
        getValue={getValue}
        onChange={noop}
        editSessionId={1}
      />,
    );

    expect(screen.getByDisplayValue('sk-mist...4321')).toBeDisabled();
    expect(screen.getByText('com_admin_config_secret_replace')).toBeInTheDocument();
  });
});

describe('renderInlineField masked secrets (collection entries)', () => {
  const apiKeyField = createField({ key: 'apiKey', type: 'string' });
  const localize = (key: string) => key;

  it('renders a masked display with a Replace flow for a configured array-entry secret', () => {
    const onChange = jest.fn();
    render(
      <>
        {renderInlineField(
          apiKeyField,
          { name: 'first', apiKeyPreview: 'sk-mist...4321' },
          'endpoints.custom.0',
          onChange,
          localize,
        )}
      </>,
    );
    const masked = screen.getByDisplayValue('sk-mist...4321');
    expect(masked).toBeDisabled();
    expect(screen.getByText('com_admin_config_secret_replace')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders a normal empty input when the array entry has no preview companion', () => {
    render(
      <>
        {renderInlineField(
          apiKeyField,
          { name: 'first' },
          'endpoints.custom.0',
          jest.fn(),
          localize,
        )}
      </>,
    );
    expect(getSecretInput()).not.toBeDisabled();
    expect(screen.queryByText('com_admin_config_secret_replace')).not.toBeInTheDocument();
  });

  it('cancelling a queued empty-string array-entry replacement clears the field with undefined', () => {
    const onChange = jest.fn();
    render(
      <>
        {renderInlineField(
          apiKeyField,
          { name: 'first', apiKey: '', apiKeyPreview: 'sk-mist...4321' },
          'endpoints.custom.0',
          onChange,
          localize,
        )}
      </>,
    );
    fireEvent.click(screen.getByText('com_admin_ui_cancel'));
    expect(onChange).toHaveBeenCalledWith('apiKey', undefined);
  });

  it('cancelling an untyped array-entry replace never calls onChange, so the entry stays clean', () => {
    const onChange = jest.fn();
    render(
      <>
        {renderInlineField(
          apiKeyField,
          { name: 'first', apiKeyPreview: 'sk-mist...4321' },
          'endpoints.custom.0',
          onChange,
          localize,
        )}
      </>,
    );
    fireEvent.click(screen.getByText('com_admin_config_secret_replace'));
    fireEvent.click(screen.getByText('com_admin_ui_cancel'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps a cleared array-entry replacement visible instead of showing the stale mask', () => {
    render(
      <>
        {renderInlineField(
          apiKeyField,
          { name: 'first', apiKey: '', apiKeyPreview: 'sk-mist...4321' },
          'endpoints.custom.0',
          jest.fn(),
          localize,
        )}
      </>,
    );
    expect(screen.queryByDisplayValue('sk-mist...4321')).not.toBeInTheDocument();
    const input = getSecretInput();
    expect(input).not.toBeDisabled();
    expect(input).toHaveValue('');
  });

  it('an untyped array-entry Replace click does not survive a bumped editSessionId', () => {
    const entry = { name: 'first', apiKeyPreview: 'sk-mist...4321' };
    const { rerender } = render(
      <>
        {renderInlineField(
          apiKeyField,
          entry,
          'endpoints.custom.0',
          jest.fn(),
          localize,
          undefined,
          undefined,
          undefined,
          0,
        )}
      </>,
    );
    fireEvent.click(screen.getByText('com_admin_config_secret_replace'));
    expect(getSecretInput()).not.toBeDisabled();

    rerender(
      <>
        {renderInlineField(
          apiKeyField,
          entry,
          'endpoints.custom.0',
          jest.fn(),
          localize,
          undefined,
          undefined,
          undefined,
          1,
        )}
      </>,
    );

    expect(screen.getByDisplayValue('sk-mist...4321')).toBeDisabled();
    expect(screen.getByText('com_admin_config_secret_replace')).toBeInTheDocument();
  });

  it('an untyped Replace click inside a nested inline group does not survive a bumped editSessionId', () => {
    const nestedField = createField({ key: 'connection', children: [apiKeyField] });
    const parentValue = { connection: { apiKeyPreview: 'sk-mist...4321' } };
    const { rerender } = render(
      <>
        {renderInlineField(
          nestedField,
          parentValue,
          'endpoints.custom.0',
          jest.fn(),
          localize,
          undefined,
          undefined,
          undefined,
          0,
        )}
      </>,
    );
    fireEvent.click(screen.getByText('connection'));
    fireEvent.click(screen.getByText('com_admin_config_secret_replace'));
    expect(getSecretInput()).not.toBeDisabled();

    rerender(
      <>
        {renderInlineField(
          nestedField,
          parentValue,
          'endpoints.custom.0',
          jest.fn(),
          localize,
          undefined,
          undefined,
          undefined,
          1,
        )}
      </>,
    );
    fireEvent.click(screen.getByText('connection'));

    expect(screen.getByDisplayValue('sk-mist...4321')).toBeDisabled();
    expect(screen.getByText('com_admin_config_secret_replace')).toBeInTheDocument();
  });
});

describe('renderInlineField nested lists from the layer beneath', () => {
  const definitions = createField({
    key: 'paramDefinitions',
    path: 'endpoints.custom.[].customParams.paramDefinitions',
    type: 'array<object>',
    isArray: true,
    isOptional: true,
    children: [
      createField({ key: 'key', path: 'endpoints.custom.[].customParams.paramDefinitions.[].key' }),
    ],
  });
  const yamlDefinition = { key: 'useResponsesApi', type: 'boolean' };
  const values: t.ConfigValuesData = {
    configValues: {
      endpoints: {
        custom: [{ name: 'Foundry', customParams: { paramDefinitions: [yamlDefinition] } }],
      },
    },
    editedValues: {},
    configuredPaths: new Set(['endpoints.custom.0.customParams.paramDefinitions']),
    overridePaths: new Set(),
    pendingResets: new Set(),
  };

  it('offers no Delete for a librechat.yaml parameter definition, only for one added here (D3)', () => {
    render(
      <ConfigValuesProvider value={values}>
        {renderInlineField(
          definitions,
          { paramDefinitions: [yamlDefinition, { key: 'mine' }] },
          'endpoints.custom.0.customParams',
          jest.fn(),
          (key: string) => key,
        )}
      </ConfigValuesProvider>,
    );
    expect(
      screen.queryByRole('button', { name: 'com_admin_ui_delete useResponsesApi' }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'com_admin_ui_delete mine' })).toBeInTheDocument();
  });
});

describe('renderInlineField required values from the layer beneath', () => {
  const baseURL = createField({
    key: 'baseURL',
    path: 'endpoints.custom.[].baseURL',
    type: 'string',
    isOptional: false,
  });
  const entry = { name: 'Moonshot', baseURL: 'https://api.moonshot.ai/v1' };
  const values: t.ConfigValuesData = {
    configValues: { endpoints: { custom: [entry] } },
    editedValues: {},
    configuredPaths: new Set(['endpoints.custom.0.baseURL']),
    overridePaths: new Set(),
    pendingResets: new Set(),
  };

  it.each([
    ['cleared', ''],
    ['set to spaces', '   '],
  ])('stages nothing when a librechat.yaml-only value is %s (D3)', (_case, typed) => {
    const onChange = jest.fn();
    render(
      <ConfigValuesProvider value={values}>
        {renderInlineField(
          baseURL,
          entry,
          'endpoints.custom.0',
          onChange,
          (key: string) => key,
          undefined,
          undefined,
          true,
        )}
      </ConfigValuesProvider>,
    );
    const input = screen.getByDisplayValue('https://api.moonshot.ai/v1');
    fireEvent.change(input, { target: { value: typed } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('com_admin_config_ctl_clear_unavailable')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://api.moonshot.ai/v1')).toBeInTheDocument();
  });
});
