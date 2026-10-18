import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type * as t from '~/admin/types';
import { matchVariant, switchVariant, VariantField } from '../VariantField';
import { RowFilterContext } from '~/admin/contexts/RowFilterContext';
import { RecordObjectField } from '../RecordObjectField';
import { ArrayObjectField } from '../ArrayObjectField';
import { ObjectEntryCard } from '../ObjectEntryCard';
import { createField } from '~/admin/test/fixtures';
import { KeyValueField } from '../KeyValueField';
import { createPathIndex } from '~/admin/utils';
import { ListField } from '../ListField';

jest.mock('~/admin/hooks/useLocalize', () => ({
  default: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
  useLocalize: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

const nameField = createField({ key: 'name', type: 'string', path: 'list.[].name' });
const renderNameFields: t.CollectionRenderFields = (_fields, value, parentPath, onChange) => {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return (
    <input
      id={`${parentPath}-name`}
      aria-label={`name of ${parentPath}`}
      value={typeof record.name === 'string' ? record.name : ''}
      onChange={(e) => onChange('name', e.target.value)}
    />
  );
};

/** Holds the list in state, like the page does, and records every emitted value. */
function StatefulList({
  initial,
  onEmit,
  editSessionId = 0,
}: {
  initial: t.ConfigValue[];
  onEmit: (value: t.ConfigValue) => void;
  editSessionId?: number;
}) {
  const [value, setValue] = useState<t.ConfigValue>(initial);
  return (
    <>
      <button
        type="button"
        onClick={() => setValue([...(value as t.ConfigValue[]), { name: 'external' }])}
      >
        {'append externally'}
      </button>
      <ArrayObjectField
        id="list"
        path="list"
        value={value}
        fields={[nameField]}
        onChange={(next) => {
          onEmit(next);
          setValue(next);
        }}
        renderFields={renderNameFields}
        editSessionId={editSessionId}
      />
    </>
  );
}

describe('ObjectEntryCard', () => {
  const baseProps = {
    entryKey: 'Zai 2',
    dataPath: 'endpoints.custom.3',
    fields: [nameField],
    value: { name: 'Zai 2' },
    renderFields: renderNameFields,
  };

  it('has one header button with aria-expanded, and actions as siblings', () => {
    render(<ObjectEntryCard {...baseProps} onValueChange={jest.fn()} onRemove={jest.fn()} />);
    const header = screen.getByRole('button', { expanded: false });
    expect(header).toHaveTextContent('Zai 2');
    const remove = screen.getByRole('button', { name: 'com_admin_ui_delete Zai 2' });
    expect(header.contains(remove)).toBe(false);
    expect(remove.closest('button[aria-expanded]')).toBeNull();
  });

  it('toggles with Enter/Space on the header and deletes with Enter on Delete without toggling', () => {
    const onRemove = jest.fn();
    render(<ObjectEntryCard {...baseProps} onValueChange={jest.fn()} onRemove={onRemove} />);
    const header = screen.getByRole('button', { expanded: false });
    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    const remove = screen.getByRole('button', { name: 'com_admin_ui_delete Zai 2' });
    remove.focus();
    fireEvent.click(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });

  it('derives field ids from the data path, not the display name', () => {
    render(<ObjectEntryCard {...baseProps} onValueChange={jest.fn()} defaultExpanded />);
    expect(document.getElementById('endpoints.custom.3-name')).not.toBeNull();
    expect(document.querySelector('[id="Zai 2-name"]')).toBeNull();
  });

  it('merges two field changes made in the same tick', () => {
    const onValueChange = jest.fn();
    const twoChanges: t.CollectionRenderFields = (_f, _v, _p, onChange) => (
      <button
        type="button"
        onClick={() => {
          onChange('type', 'number');
          onChange('component', undefined);
        }}
      >
        {'change type'}
      </button>
    );
    render(
      <ObjectEntryCard
        {...baseProps}
        value={{ key: 'temp', type: 'boolean', component: 'switch' }}
        renderFields={twoChanges}
        onValueChange={onValueChange}
        defaultExpanded
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'change type' }));
    expect(onValueChange).toHaveBeenLastCalledWith({ key: 'temp', type: 'number' });
  });

  it('expands on config:expand and collapses on config:collapse', () => {
    const { container } = render(<ObjectEntryCard {...baseProps} onValueChange={jest.fn()} />);
    const card = container.querySelector('[data-entry-card]')!;
    fireEvent(card, new Event('config:expand'));
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
    fireEvent(card, new Event('config:collapse'));
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument();
  });

  it('applies defaultExpanded when it turns true after mount', () => {
    const { rerender } = render(<ObjectEntryCard {...baseProps} onValueChange={jest.fn()} />);
    rerender(<ObjectEntryCard {...baseProps} onValueChange={jest.fn()} defaultExpanded />);
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
  });
});

describe('ArrayObjectField', () => {
  it('appends a new entry at the end, expanded and marked New', () => {
    const onEmit = jest.fn();
    render(<StatefulList initial={[{ name: 'first' }]} onEmit={onEmit} />);
    fireEvent.click(screen.getByRole('button', { name: /com_admin_ui_add_item/ }));
    expect(onEmit).toHaveBeenLastCalledWith([{ name: 'first' }, {}]);
    const headers = screen.getAllByRole('button', { expanded: true });
    expect(headers).toHaveLength(1);
    expect(headers[0]).toHaveTextContent('com_admin_config_ctl_entry_new');
    expect(document.getElementById('list.1-name')).not.toBeNull();
  });

  it('expands an entry appended from outside (e.g. a create dialog)', () => {
    render(<StatefulList initial={[{ name: 'first' }]} onEmit={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'append externally' }));
    expect(screen.getByRole('button', { expanded: true })).toHaveTextContent('external');
  });

  it('marks a deleted entry pending with Undo, which restores it at its position', () => {
    const onEmit = jest.fn();
    render(
      <StatefulList initial={[{ name: 'a' }, { name: 'b' }, { name: 'c' }]} onEmit={onEmit} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'com_admin_ui_delete b' }));
    expect(onEmit).toHaveBeenLastCalledWith([{ name: 'a' }, { name: 'c' }]);
    expect(screen.getByText('com_admin_config_ctl_entry_pending_delete')).toBeInTheDocument();
    const undo = screen.getByRole('button', { name: /com_admin_config_ctl_entry_undo_a11y/ });
    expect(undo).toHaveFocus();
    fireEvent.click(undo);
    expect(onEmit).toHaveBeenLastCalledWith([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
    expect(screen.queryByText('com_admin_config_ctl_entry_pending_delete')).not.toBeInTheDocument();
  });

  it('keeps an entry expanded while another one is deleted (stable keys)', () => {
    render(
      <StatefulList initial={[{ name: 'a' }, { name: 'b' }, { name: 'c' }]} onEmit={jest.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^c/, expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: 'com_admin_ui_delete a' }));
    expect(screen.getByRole('button', { name: /^c/, expanded: true })).toBeInTheDocument();
  });

  it('shows an empty state even when the add button lives elsewhere', () => {
    render(
      <ArrayObjectField
        id="l"
        value={[]}
        fields={[nameField]}
        onChange={jest.fn()}
        renderFields={renderNameFields}
        hideAddButton
      />,
    );
    expect(screen.getByText('com_admin_config_no_entries')).toBeInTheDocument();
  });

  it('keeps a deleted entry listed, with Undo, while the tab filter is on', () => {
    function Filtered() {
      const [value, setValue] = useState<t.ConfigValue>([{ name: 'a' }, { name: 'b' }]);
      return (
        <RowFilterContext.Provider value={createPathIndex(['list.0.name'])}>
          <ArrayObjectField
            id="l"
            path="list"
            value={value}
            fields={[nameField]}
            onChange={setValue}
            renderFields={renderNameFields}
          />
        </RowFilterContext.Provider>
      );
    }
    render(<Filtered />);
    expect(screen.queryByRole('button', { name: 'com_admin_ui_delete b' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_admin_ui_delete a' }));
    expect(screen.getByText('com_admin_config_ctl_entry_pending_delete')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /com_admin_config_ctl_entry_undo_a11y/ }),
    ).toBeInTheDocument();
  });

  it('hides delete for locked entries', () => {
    render(
      <ArrayObjectField
        id="l"
        value={[{ name: 'yaml' }, { name: 'db' }]}
        fields={[nameField]}
        onChange={jest.fn()}
        renderFields={renderNameFields}
        isEntryLocked={(item) => (item as t.ConfigRecord).name === 'yaml'}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'com_admin_ui_delete yaml' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_admin_ui_delete db' })).toBeInTheDocument();
  });
});

describe('RecordObjectField', () => {
  it('offers no rename or delete for keys the layer beneath defines (D3)', () => {
    render(
      <RecordObjectField
        id="vars"
        path="mcpServers.github.customUserVars"
        value={{ PAT_TOKEN: { title: 'PAT' }, OWN: { title: 'Own' } }}
        fields={[]}
        onChange={jest.fn()}
        renderFields={renderNameFields}
        lockedKeys={new Set(['PAT_TOKEN'])}
      />,
    );
    expect(screen.queryByRole('button', { name: 'com_admin_ui_delete PAT_TOKEN' })).toBeNull();
    expect(screen.getByRole('button', { name: 'com_admin_ui_delete OWN' })).toBeInTheDocument();
    expect(screen.getAllByTitle(/com_admin_a11y_rename_entry/)).toHaveLength(1);
    expect(screen.getByTitle('com_admin_config_ctl_kv_locked')).toBeInTheDocument();
  });
});

describe('VariantField', () => {
  const idVariant: t.FieldVariant = {
    key: 'existing',
    fields: [
      createField({ key: 'enabled', type: 'boolean' }),
      createField({ key: 'id', type: 'string' }),
    ],
  };
  const inlineVariant: t.FieldVariant = {
    key: 'inline',
    fields: [
      createField({ key: 'enabled', type: 'boolean' }),
      createField({ key: 'provider', type: 'string' }),
      createField({ key: 'model', type: 'string' }),
    ],
  };
  const renderFields: t.VariantFieldProps['renderFields'] = (fields) => (
    <span>{fields.map((f) => f.key).join(',')}</span>
  );

  it('matches the branch by keys or discriminator', () => {
    expect(matchVariant({ id: 'agent_1' }, [idVariant, inlineVariant])?.key).toBe('existing');
    expect(matchVariant({ provider: 'openAI', model: 'x' }, [idVariant, inlineVariant])?.key).toBe(
      'inline',
    );
    const typed = [
      { key: 'token_ratio', discriminatorValue: 'token_ratio', fields: [] },
      { key: 'message_count', discriminatorValue: 'message_count', fields: [] },
    ];
    expect(matchVariant({ type: 'message_count', value: 3 }, typed, 'type')?.key).toBe(
      'message_count',
    );
  });

  it('keeps shared keys and lists lower-layer keys to tombstone when switching', () => {
    const result = switchVariant({ enabled: true, id: 'agent_1' }, inlineVariant, undefined, [
      'id',
    ]);
    expect(result.value).toEqual({ enabled: true });
    expect(result.tombstones).toEqual(['id']);
  });

  it('emits tombstones for librechat.yaml keys the new branch drops, then writes the whole object', () => {
    const onChange = jest.fn();
    const onTombstone = jest.fn();
    render(
      <VariantField
        id="v"
        value={{ enabled: true, id: 'agent_1' }}
        variants={[idVariant, inlineVariant]}
        inheritedKeys={['id']}
        onChange={onChange}
        onTombstone={onTombstone}
        renderFields={renderFields}
      />,
    );
    expect(screen.getByText('enabled,id')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'inline' } });
    expect(onTombstone).toHaveBeenCalledWith(['id']);
    expect(onChange).toHaveBeenCalledWith({ enabled: true });
  });

  it('explains instead of switching when lower-layer keys cannot be hidden', () => {
    const onChange = jest.fn();
    render(
      <VariantField
        id="v"
        value={{ id: 'agent_1' }}
        variants={[idVariant, inlineVariant]}
        inheritedKeys={['id']}
        onChange={onChange}
        renderFields={renderFields}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'inline' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('com_admin_config_ctl_variant_blocked');
  });

  it('keeps the chosen branch while the value fits none, without writing an empty object', () => {
    const onChange = jest.fn();
    const variants: t.FieldVariant[] = [
      { key: 'id', fields: [createField({ key: 'id', type: 'string' })] },
      {
        key: 'provider',
        fields: [
          createField({ key: 'provider', type: 'string' }),
          createField({ key: 'model', type: 'string' }),
        ],
      },
    ];
    render(
      <VariantField
        id="v"
        value={undefined}
        variants={variants}
        onChange={onChange}
        renderFields={renderFields}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'provider' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toHaveValue('provider');
    expect(screen.getByText('provider,model')).toBeInTheDocument();
  });

  it('drops its own value when switching to a branch that keeps none of it', () => {
    const onChange = jest.fn();
    render(
      <VariantField
        id="v"
        value={{ id: 'agent_1' }}
        variants={[
          { key: 'id', fields: [createField({ key: 'id', type: 'string' })] },
          { key: 'provider', fields: [createField({ key: 'provider', type: 'string' })] },
        ]}
        onChange={onChange}
        renderFields={renderFields}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'provider' } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('sets the discriminator when switching a discriminated union', () => {
    const onChange = jest.fn();
    const variants: t.FieldVariant[] = [
      {
        key: 'token_ratio',
        discriminatorValue: 'token_ratio',
        fields: [createField({ key: 'type' }), createField({ key: 'value', type: 'number' })],
      },
      {
        key: 'message_count',
        discriminatorValue: 'message_count',
        fields: [createField({ key: 'type' }), createField({ key: 'value', type: 'number' })],
      },
    ];
    render(
      <VariantField
        id="v"
        value={{ type: 'token_ratio', value: 0.8 }}
        variants={variants}
        discriminator="type"
        onChange={onChange}
        renderFields={renderFields}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'message_count' } });
    expect(onChange).toHaveBeenCalledWith({ value: 0.8, type: 'message_count' });
  });
});

describe('KeyValueField', () => {
  it('keeps a new row local until it has a key, then infers the value type', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <KeyValueField id="kv" pairs={[]} onChange={onChange} onClear={jest.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /com_admin_ui_add_item/ }));
    expect(onChange).not.toHaveBeenCalled();
    const key = screen.getByRole('textbox', { name: 'com_admin_ui_key 1' });
    fireEvent.change(key, { target: { value: 'max_tokens' } });
    fireEvent.blur(key);
    expect(onChange).toHaveBeenLastCalledWith([
      { key: 'max_tokens', value: '', valueType: 'string' },
    ]);
    rerender(
      <KeyValueField
        id="kv"
        pairs={[{ key: 'max_tokens', value: '', valueType: 'string' }]}
        onChange={onChange}
        onClear={jest.fn()}
      />,
    );
    const value = screen.getByRole('textbox', { name: 'com_admin_ui_value 1' });
    fireEvent.change(value, { target: { value: '4096' } });
    fireEvent.blur(value);
    expect(onChange).toHaveBeenLastCalledWith([
      { key: 'max_tokens', value: '4096', valueType: 'number' },
    ]);
  });

  it('keeps the new row (and the focused value input) when its key commits', () => {
    function Stateful() {
      const [pairs, setPairs] = useState<t.KeyValuePair[]>([]);
      return <KeyValueField id="kv" pairs={pairs} onChange={setPairs} onClear={jest.fn()} />;
    }
    render(<Stateful />);
    fireEvent.click(screen.getByRole('button', { name: /com_admin_ui_add_item/ }));
    const key = screen.getByRole('textbox', { name: 'com_admin_ui_key 1' });
    const value = screen.getByRole('textbox', { name: 'com_admin_ui_value 1' });
    fireEvent.change(key, { target: { value: 'X-Org' } });
    value.focus();
    fireEvent.blur(key);
    expect(screen.getByRole('textbox', { name: 'com_admin_ui_value 1' })).toBe(value);
    expect(document.activeElement).toBe(value);
  });

  it('calls onClear when the last row is removed', () => {
    const onChange = jest.fn();
    const onClear = jest.fn();
    render(
      <KeyValueField
        id="kv"
        pairs={[{ key: 'a', value: '1' }]}
        onChange={onChange}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'com_admin_ui_delete a' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('flags a blank key and keeps its row a draft, so no header named "  " is saved', () => {
    const onChange = jest.fn();
    render(<KeyValueField id="kv" pairs={[]} onChange={onChange} onClear={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /com_admin_ui_add_item/ }));
    const key = screen.getByRole('textbox', { name: 'com_admin_ui_key 1' });
    fireEvent.change(key, { target: { value: '  ' } });
    fireEvent.blur(key);
    const value = screen.getByRole('textbox', { name: 'com_admin_ui_value 1' });
    fireEvent.change(value, { target: { value: 'value-only' } });
    fireEvent.blur(value);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('com_admin_config_ctl_kv_blank_key');
  });

  it('removes a row whose key is changed to spaces, as when it is cleared', () => {
    const onChange = jest.fn();
    render(
      <KeyValueField
        id="kv"
        pairs={[
          { key: 'X-A', value: '1' },
          { key: 'X-B', value: '2' },
        ]}
        onChange={onChange}
        onClear={jest.fn()}
      />,
    );
    const key = screen.getByRole('textbox', { name: 'com_admin_ui_key 1' });
    fireEvent.change(key, { target: { value: '   ' } });
    fireEvent.blur(key);
    expect(onChange).toHaveBeenLastCalledWith([{ key: 'X-B', value: '2' }]);
  });

  it('offers only text in string-only mode', () => {
    render(
      <KeyValueField
        id="kv"
        pairs={[{ key: 'en', value: 'Hi' }]}
        onChange={jest.fn()}
        valueTypes={['string']}
      />,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('ListField', () => {
  it('keeps a new row as a draft, rejects duplicates and keeps item whitespace', () => {
    const onChange = jest.fn();
    render(
      <ListField id="l" values={['\n\nHuman:', 'STOP']} onChange={onChange} onClear={jest.fn()} />,
    );
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('\n\nHuman:');
    fireEvent.click(screen.getByRole('button', { name: /com_admin_ui_add_item/ }));
    expect(onChange).not.toHaveBeenCalled();
    const draft = screen.getByRole('textbox', { name: 'com_admin_ui_item 3' });
    fireEvent.change(draft, { target: { value: 'STOP' } });
    fireEvent.keyDown(draft, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('com_admin_config_ctl_list_duplicate');
    fireEvent.change(draft, { target: { value: ' ###' } });
    fireEvent.blur(draft);
    expect(onChange).toHaveBeenLastCalledWith(['\n\nHuman:', 'STOP', ' ###']);
  });

  it('drops an item edited to only spaces', () => {
    const onChange = jest.fn();
    render(
      <ListField id="l" values={['a.com', 'b.com']} onChange={onChange} onClear={jest.fn()} />,
    );
    const item = screen.getByRole('textbox', { name: 'com_admin_ui_item 1' });
    fireEvent.change(item, { target: { value: '   ' } });
    fireEvent.blur(item);
    expect(onChange).toHaveBeenLastCalledWith(['b.com']);
  });

  it('keeps whitespace-only stop sequences ("\\n", " ") with keepsWhitespace', () => {
    const onChange = jest.fn();
    render(
      <ListField
        id="l"
        values={['\n', 'STOP']}
        onChange={onChange}
        onClear={jest.fn()}
        keepsWhitespace
      />,
    );
    const stop = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(stop.value).toBe('\n');
    fireEvent.change(stop, { target: { value: '\n\n' } });
    fireEvent.blur(stop);
    expect(onChange).toHaveBeenLastCalledWith(['\n\n', 'STOP']);
    fireEvent.click(screen.getByRole('button', { name: /com_admin_ui_add_item/ }));
    const draft = screen.getByRole('textbox', { name: 'com_admin_ui_item 3' });
    fireEvent.change(draft, { target: { value: ' ' } });
    fireEvent.blur(draft);
    expect(onChange).toHaveBeenLastCalledWith(['\n', 'STOP', ' ']);
  });

  it('resets the field instead of saving [] when the last item is removed', () => {
    const onChange = jest.fn();
    const onClear = jest.fn();
    render(<ListField id="l" values={['example.com']} onChange={onChange} onClear={onClear} />);
    fireEvent.click(screen.getByRole('button', { name: 'com_admin_ui_delete example.com' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});
