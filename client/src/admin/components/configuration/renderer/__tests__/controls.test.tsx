import { FieldRenderer, SingleFieldRenderer } from '..';
import { render, screen, fireEvent } from '@testing-library/react';
import type * as t from '~/admin/types';
import { renderInlineField, collectionKeyOf } from '../InlineField';
import { resolveControl, fieldOptions } from '../kinds';
import { createField } from '~/admin/test/fixtures';
import { deriveFieldDefault } from '../defaults';
import { fitsControl } from '../FieldControl';

jest.mock('~/admin/hooks/useLocalize', () => ({
  default: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
  useLocalize: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

const getValue = (_path: string, fallback: t.ConfigValue) => fallback;
const kindOf = (overrides: Partial<t.SchemaField> & { key: string }, value?: t.ConfigValue) =>
  resolveControl({ field: createField(overrides), path: `x.${overrides.key}`, value }).kind;

describe('resolveControl', () => {
  it('maps optional booleans to the tri-state and required ones to a switch', () => {
    expect(kindOf({ key: 'titleConvo', type: 'boolean', isOptional: true })).toBe('tristate');
    expect(kindOf({ key: 'enabled', type: 'boolean' })).toBe('toggle');
  });

  it('maps unions the legacy type mapping cannot round-trip', () => {
    expect(kindOf({ key: 'skills', type: 'union(boolean | array<string>)' })).toBe('bool-or-list');
    expect(kindOf({ key: 'maxContextTokens', type: 'union(number | string)' })).toBe('number');
    expect(kindOf({ key: 'artifacts', type: 'union(string | boolean)' })).toBe('scalar-union');
    expect(kindOf({ key: 'includeAnswer', type: 'union(boolean | enum(basic | advanced))' })).toBe(
      'select',
    );
    expect(kindOf({ key: 'provider', type: 'literal("anthropic")' })).toBe('literal');
    expect(kindOf({ key: 'default', type: 'array<union(string | object)>', isArray: true })).toBe(
      'model-list',
    );
    expect(kindOf({ key: 'capabilities', type: 'array<enum(tools | chain)>', isArray: true })).toBe(
      'multi-enum',
    );
    expect(kindOf({ key: 'trigger', type: 'ZodDiscriminatedUnion' })).toBe('code');
  });

  it('picks a textarea for prompts and multi-line values, and a secret input for keys', () => {
    expect(kindOf({ key: 'titlePrompt', type: 'string' })).toBe('textarea');
    expect(kindOf({ key: 'label', type: 'string' }, 'a\nb')).toBe('textarea');
    expect(kindOf({ key: 'label', type: 'string' }, 'ab')).toBe('text');
    expect(kindOf({ key: 'apiKey', type: 'string' })).toBe('secret');
    expect(kindOf({ key: 'tavilyApiKey', type: 'string' })).toBe('secret');
  });

  it("keeps '' enum members", () => {
    const field = createField({ key: 'effort', type: 'enum( | low | high)' });
    const { options } = fieldOptions(field, (key) => key);
    expect(options.map((o) => o.value)).toEqual(['', 'low', 'high']);
  });
});

describe('fitsControl', () => {
  it('rejects values a control cannot show or re-emit unchanged', () => {
    const field = createField({ key: 'x' });
    expect(fitsControl('text', field, { a: 1 })).toBe(false);
    expect(fitsControl('array', field, [{ name: 'x' }])).toBe(false);
    expect(fitsControl('record', field, true)).toBe(false);
    expect(fitsControl('tristate', field, 'yes')).toBe(false);
    expect(fitsControl('model-list', field, [{ name: 'x' }, 'y'])).toBe(true);
    expect(fitsControl('text', field, 3)).toBe(true);
  });
});

describe('deriveFieldDefault', () => {
  const base: t.FieldState = {
    value: undefined,
    effective: undefined,
    source: 'default',
    isConfigured: false,
    isOverride: false,
    isEdited: false,
    isPendingReset: false,
    isHidden: false,
  };

  it('uses the effective value when the target has no own value', () => {
    const state = { ...base, effective: true, source: 'yaml' as const, isConfigured: true };
    expect(deriveFieldDefault(state, undefined, undefined)).toEqual({
      hasOwnValue: false,
      value: true,
      source: 'yaml',
    });
  });

  it('uses the revert target, else the schema default, for an override', () => {
    const state = { ...base, effective: false, isOverride: true, source: 'admin' as const };
    expect(deriveFieldDefault(state, undefined, true)).toMatchObject({
      hasOwnValue: true,
      value: true,
    });
    expect(
      deriveFieldDefault(
        { ...state, revertTarget: { value: 'yamlValue', source: 'yaml' } },
        undefined,
        true,
      ),
    ).toMatchObject({ value: 'yamlValue', source: 'yaml' });
  });

  it('names Base as the source of an inherited value in a profile', () => {
    const state = {
      ...base,
      effective: true,
      source: 'inherited' as const,
      inherited: { value: true, source: 'yaml' as const },
    };
    expect(deriveFieldDefault(state, undefined, undefined)).toEqual({
      hasOwnValue: false,
      value: true,
      source: 'inherited',
    });
    const fromDefault = { ...state, inherited: { value: true, source: 'default' as const } };
    expect(deriveFieldDefault(fromDefault, undefined, undefined).source).toBe('default');
  });

  it('falls back to the runtime default from metadata', () => {
    expect(deriveFieldDefault(base, { runtimeDefault: true }, undefined)).toMatchObject({
      value: true,
      source: 'runtimeDefault',
    });
  });

  it("names Global's value for an unset field Global takes precedence over (D11)", () => {
    const shadowedBy: t.ShadowedBy = {
      path: 'endpoints.all.activityLabels',
      value: true,
      precedence: 'field',
    };
    const state = { ...base, effective: false, shadowedBy };
    expect(deriveFieldDefault(state, undefined, false)).toEqual({
      hasOwnValue: false,
      value: true,
      source: 'default',
      fromGlobal: true,
    });
    expect(
      deriveFieldDefault({ ...state, isEdited: true }, undefined, false).fromGlobal,
    ).toBeUndefined();
  });
});

describe('FieldRenderer boolean|object fields', () => {
  const child = createField({
    key: 'maxPerUser',
    type: 'number',
    path: 'interface.schedules.maxPerUser',
    isOptional: true,
  });
  const schedules = createField({
    key: 'schedules',
    type: 'union(boolean | object)',
    path: 'interface.schedules',
    isOptional: true,
    children: [child],
  });
  const skills = createField({
    key: 'skills',
    type: 'union(boolean | object)',
    path: 'interface.skills',
    isOptional: true,
    children: [
      createField({ key: 'use', type: 'boolean', path: 'interface.skills.use', isOptional: true }),
    ],
  });

  it('gives the field an on/off header that writes a bare false, and child rows with full paths', () => {
    const onChange = jest.fn();
    render(
      <FieldRenderer
        fields={[schedules]}
        parentValue={{ schedules: true }}
        parentPath="interface"
        getValue={getValue}
        onChange={onChange}
      />,
    );
    const header = document.getElementById('interface-schedules')!;
    fireEvent.click(header.querySelector('button:nth-child(3)')!);
    expect(onChange).toHaveBeenCalledWith('interface.schedules', false);
    const maxPerUser = document.getElementById(
      'interface-schedules-maxPerUser',
    ) as HTMLInputElement;
    fireEvent.change(maxPerUser, { target: { value: '5' } });
    fireEvent.blur(maxPerUser);
    expect(onChange).toHaveBeenLastCalledWith('interface.schedules.maxPerUser', 5);
  });

  it('turning it back on restores the object it had', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <FieldRenderer
        fields={[schedules]}
        parentValue={{ schedules: { maxPerUser: 3 } }}
        parentPath="interface"
        getValue={getValue}
        onChange={onChange}
        dbOverridePaths={new Set(['interface.schedules.maxPerUser'])}
      />,
    );
    rerender(
      <FieldRenderer
        fields={[schedules]}
        parentValue={{ schedules: false }}
        parentPath="interface"
        getValue={getValue}
        onChange={onChange}
        dbOverridePaths={new Set(['interface.schedules.maxPerUser'])}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'com_admin_config_ctl_on' }));
    expect(onChange).toHaveBeenLastCalledWith('interface.schedules', { maxPerUser: 3 });
  });

  it('leaves interface permission fields as plain groups without a header switch', () => {
    render(
      <FieldRenderer
        fields={[skills]}
        parentValue={{ skills: true }}
        parentPath="interface"
        getValue={getValue}
        onChange={jest.fn()}
      />,
    );
    expect(document.getElementById('interface-skills')).toBeNull();
    expect(screen.getByRole('button', { name: /^skills/ })).toHaveAttribute('aria-expanded');
  });
});

describe('SingleFieldRenderer row affordances', () => {
  it('shows Reset for a record whose override is stored as leaves', () => {
    const onResetField = jest.fn();
    render(
      <SingleFieldRenderer
        field={createField({
          key: 'trigger',
          type: 'ZodDiscriminatedUnion',
          path: 'summarization.trigger',
          isOptional: true,
        })}
        value={{ type: 'token_ratio', value: 0.8 }}
        path="summarization.trigger"
        getValue={getValue}
        onChange={jest.fn()}
        onResetField={onResetField}
        permissions={{ canView: true, canEdit: true, canAssign: false }}
        configuredPaths={new Set(['summarization.trigger.type', 'summarization.trigger.value'])}
        dbOverridePaths={new Set(['summarization.trigger.type', 'summarization.trigger.value'])}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /com_admin_a11y_reset_to_default/ }));
    expect(onResetField).toHaveBeenCalledWith('summarization.trigger');
    expect(document.getElementById('summarization-trigger')).toHaveValue(
      'type: token_ratio\nvalue: 0.8',
    );
  });

  it('keeps the marker, default and Reset on a sole-field section', () => {
    const onResetField = jest.fn();
    render(
      <SingleFieldRenderer
        field={createField({
          key: 'imageOutputType',
          type: 'enum(png | webp | jpeg)',
          path: 'imageOutputType',
          isOptional: true,
        })}
        value="webp"
        path="imageOutputType"
        getValue={getValue}
        onChange={jest.fn()}
        onResetField={onResetField}
        permissions={{ canView: true, canEdit: true, canAssign: false }}
        configuredPaths={new Set(['imageOutputType'])}
        dbOverridePaths={new Set(['imageOutputType'])}
        schemaDefaults={{ imageOutputType: 'png' }}
        isSoleField
      />,
    );
    expect(screen.getByRole('combobox')).toHaveValue('webp');
    expect(screen.getByText('com_admin_config_ui_state_override')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /com_admin_a11y_reset_to_default/ }));
    expect(onResetField).toHaveBeenCalledWith('imageOutputType');
  });

  it('drops a pending edit when an optional boolean goes back to Default', () => {
    const onChange = jest.fn();
    const onDiscardField = jest.fn();
    render(
      <SingleFieldRenderer
        field={createField({
          key: 'titleConvo',
          type: 'boolean',
          path: 'endpoints.all.titleConvo',
          isOptional: true,
        })}
        value={true}
        path="endpoints.all.titleConvo"
        getValue={getValue}
        onChange={onChange}
        onDiscardField={onDiscardField}
        editedValues={{ 'endpoints.all.titleConvo': true }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^com_admin_config_ctl_default/ }));
    expect(onDiscardField).toHaveBeenCalledWith('endpoints.all.titleConvo');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes an override (pending reset) when Default is chosen', () => {
    const onChange = jest.fn();
    render(
      <SingleFieldRenderer
        field={createField({
          key: 'titleConvo',
          type: 'boolean',
          path: 'endpoints.all.titleConvo',
          isOptional: true,
        })}
        value={false}
        path="endpoints.all.titleConvo"
        getValue={getValue}
        onChange={onChange}
        dbOverridePaths={new Set(['endpoints.all.titleConvo'])}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^com_admin_config_ctl_default/ }));
    expect(onChange).toHaveBeenCalledWith('endpoints.all.titleConvo', undefined);
  });
});

describe('enum-valued records', () => {
  it('offers the enum members as a value select (WS2 itemType)', () => {
    render(
      <SingleFieldRenderer
        field={createField({
          key: 'overrides',
          type: 'record',
          path: 'fileConfig.defaultLLMDeliveryPath.overrides',
          isOptional: true,
          itemType: 'enum(provider | text | none)',
        })}
        value={{ agents: 'text' }}
        path="fileConfig.defaultLLMDeliveryPath.overrides"
        getValue={getValue}
        onChange={jest.fn()}
      />,
    );
    const options = screen.getAllByRole('option').map((o) => o.getAttribute('value'));
    expect(options).toEqual(expect.arrayContaining(['provider', 'text', 'none']));
  });
});

describe('renderInlineField', () => {
  const localize = (key: string) => key;

  it('edits a multi-line description in a textarea and keeps its newline', () => {
    const onChange = jest.fn();
    render(
      <>
        {renderInlineField(
          createField({ key: 'description', type: 'string', isOptional: true }),
          { name: 'spec-a', description: 'Line one\nLine two' },
          'modelSpecs.list.0',
          onChange,
          localize,
        )}
      </>,
    );
    const textarea = document.getElementById(
      'modelSpecs-list-0-description',
    ) as HTMLTextAreaElement;
    expect(textarea.tagName).toBe('TEXTAREA');
    fireEvent.change(textarea, { target: { value: 'Line one\nLine two!' } });
    fireEvent.blur(textarea);
    expect(onChange).toHaveBeenCalledWith('description', 'Line one\nLine two!');
  });

  it('never shows [object Object] for object model items', () => {
    const { container } = render(
      <>
        {renderInlineField(
          createField({ key: 'default', type: 'array<union(string | object)>', isArray: true }),
          { default: [{ name: 'kimi-k2.5', description: 'Flagship' }, 'kimi-latest'] },
          'endpoints.custom.3.models',
          jest.fn(),
          localize,
          false,
          undefined,
          true,
        )}
      </>,
    );
    expect(container.textContent).not.toContain('[object Object]');
    expect(screen.getByText('kimi-k2.5')).toBeInTheDocument();
  });

  it('removes the key when an optional entry field is set back to Default', () => {
    const onChange = jest.fn();
    render(
      <>
        {renderInlineField(
          createField({ key: 'titleConvo', type: 'boolean', isOptional: true }),
          { titleConvo: true },
          'endpoints.custom.0',
          onChange,
          localize,
        )}
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^com_admin_config_ctl_default/ }));
    expect(onChange).toHaveBeenCalledWith('titleConvo', undefined);
  });

  it('builds field ids without spaces from the data path', () => {
    render(
      <>
        {renderInlineField(
          createField({ key: 'name', type: 'string' }),
          { name: 'Zai 2' },
          'Zai 2',
          jest.fn(),
          localize,
        )}
      </>,
    );
    expect(document.getElementById('Zai-2-name')).not.toBeNull();
  });

  it('derives the collection key from the schema path, not the entry name', () => {
    const fields = [createField({ key: 'name', path: 'modelSpecs.list.[].name' })];
    expect(collectionKeyOf(fields, 'custom')).toBe('list');
    const preset = [createField({ key: 'model', path: 'modelSpecs.list.[].preset.model' })];
    expect(collectionKeyOf(preset, 'whatever')).toBe('preset');
  });
});

describe('YAML-managed notice', () => {
  it('renders once at the managed root, not for every descendant', () => {
    const vertex = createField({
      key: 'vertex',
      type: 'object',
      isObject: true,
      path: 'endpoints.anthropic.vertex',
      children: [
        createField({ key: 'region', type: 'string', path: 'endpoints.anthropic.vertex.region' }),
        createField({
          key: 'projectId',
          type: 'string',
          path: 'endpoints.anthropic.vertex.projectId',
        }),
      ],
    });
    render(
      <FieldRenderer
        fields={[vertex]}
        parentValue={{ vertex: { region: 'us-east5' } }}
        parentPath="endpoints.anthropic"
        getValue={getValue}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getAllByText('com_admin_config_yaml_managed_field')).toHaveLength(1);
  });
});
