import { Children, isValidElement, useId, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { Label, disabledFillClasses, disabledInkClasses } from '@librechat/client';
import type { ReactNode, ReactElement } from 'react';
import { Icon } from './Icon';
import { cn } from '~/utils';

/**
 * Click-ui's select, on Ariakit (the menu and listbox library SassyChat builds on). Options come
 * as a flat or grouped `options` list, or as `Select.Item` children; `showSearch` filters them.
 */

export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface SelectGroup {
  heading?: ReactNode;
  label?: ReactNode;
  options: SelectOption[];
}

export interface SelectProps {
  options?: Array<SelectOption | SelectGroup>;
  children?: ReactNode;
  value?: string;
  defaultValue?: string;
  onSelect?: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  placeholder?: string;
  label?: ReactNode;
  id?: string;
  disabled?: boolean;
  showSearch?: boolean;
  className?: string;
  'aria-label'?: string;
}

interface SelectItemProps {
  value: string;
  disabled?: boolean;
  children?: ReactNode;
}

function SelectItem(_props: SelectItemProps): null {
  return null;
}

function isGroup(option: SelectOption | SelectGroup): option is SelectGroup {
  return Array.isArray((option as SelectGroup).options);
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textOf).join('');
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textOf(node.props.children);
  }
  return '';
}

function groupsOf(options: SelectProps['options'], children: ReactNode): SelectGroup[] {
  const fromChildren: SelectOption[] = Children.toArray(children)
    .filter((child): child is ReactElement<SelectItemProps> => isValidElement(child))
    .map((child) => ({
      value: child.props.value,
      label: child.props.children,
      disabled: child.props.disabled,
    }));
  const flat: SelectOption[] = [];
  const groups: SelectGroup[] = [];
  for (const option of options ?? []) {
    if (isGroup(option)) {
      groups.push(option);
    } else {
      flat.push(option);
    }
  }
  const loose = [...flat, ...fromChildren];
  return loose.length > 0 ? [{ options: loose }, ...groups] : groups;
}

const ITEM_CLASS = cn(
  'text-text-primary data-active-item:bg-surface-hover aria-selected:font-medium flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
  disabledInkClasses,
);

function SelectRoot({
  options,
  children,
  value,
  defaultValue,
  onSelect,
  onOpenChange,
  placeholder,
  label,
  id,
  disabled,
  showSearch,
  className,
  ...aria
}: SelectProps) {
  const generated = useId();
  const selectId = id ?? generated;
  const [search, setSearch] = useState('');
  const groups = useMemo(() => groupsOf(options, children), [options, children]);
  const all = groups.flatMap((group) => group.options);
  const needle = search.trim().toLowerCase();
  const shown = needle
    ? groups
        .map((group) => ({
          ...group,
          options: group.options.filter((option) =>
            textOf(option.label).toLowerCase().includes(needle),
          ),
        }))
        .filter((group) => group.options.length > 0)
    : groups;

  const items = shown.map((group, index) => {
    const heading = group.heading ?? group.label;
    const rendered = group.options.map((option) => (
      <Ariakit.SelectItem
        key={option.value}
        value={option.value}
        disabled={option.disabled}
        className={ITEM_CLASS}
        render={showSearch ? <Ariakit.ComboboxItem /> : undefined}
      >
        <span className="truncate">{option.label}</span>
        <Ariakit.SelectItemCheck className="text-text-secondary size-4" />
      </Ariakit.SelectItem>
    ));
    return heading ? (
      <Ariakit.SelectGroup key={index} className="flex flex-col">
        <Ariakit.SelectGroupLabel className="text-text-secondary px-2 pt-2 pb-1 text-xs font-medium">
          {heading}
        </Ariakit.SelectGroupLabel>
        {rendered}
      </Ariakit.SelectGroup>
    ) : (
      <div key={index} className="flex flex-col">
        {rendered}
      </div>
    );
  });

  const select = (
    <Ariakit.SelectProvider
      value={value}
      defaultValue={defaultValue ?? ''}
      setValue={(next) => {
        if (typeof next === 'string') {
          onSelect?.(next);
        }
      }}
      setOpen={onOpenChange}
    >
      {label && (
        <Ariakit.SelectLabel render={<Label />} className="text-text-primary text-sm font-medium">
          {label}
        </Ariakit.SelectLabel>
      )}
      <Ariakit.Select
        id={selectId}
        disabled={disabled}
        aria-label={label ? undefined : aria['aria-label']}
        className={cn(
          'border-border-light bg-surface-primary text-text-primary hover:bg-surface-hover focus-visible:ring-focus-control flex h-9 w-full items-center justify-between gap-2 rounded-lg border px-3 text-left text-sm focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
          disabledFillClasses,
        )}
      >
        <Ariakit.SelectValue>
          {(current) => {
            const chosen = all.find((option) => option.value === current);
            return chosen ? (
              <span className="truncate">{chosen.label}</span>
            ) : (
              <span className="text-text-secondary truncate">{placeholder}</span>
            );
          }}
        </Ariakit.SelectValue>
        <Icon name="chevron-down" size="sm" aria-hidden className="text-text-secondary" />
      </Ariakit.Select>
      <Ariakit.SelectPopover
        gutter={4}
        sameWidth
        unmountOnHide
        className="border-border-light bg-surface-primary z-50 flex max-h-72 flex-col gap-0.5 overflow-auto rounded-lg border p-1 shadow-lg"
      >
        {showSearch && (
          <Ariakit.Combobox
            autoSelect
            placeholder={placeholder}
            aria-label={aria['aria-label'] ?? placeholder}
            className="border-border-light bg-surface-primary text-text-primary mb-1 rounded-md border px-2 py-1.5 text-sm outline-hidden"
          />
        )}
        {showSearch ? <Ariakit.ComboboxList>{items}</Ariakit.ComboboxList> : items}
      </Ariakit.SelectPopover>
    </Ariakit.SelectProvider>
  );

  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      {showSearch ? (
        <Ariakit.ComboboxProvider resetValueOnHide setValue={setSearch}>
          {select}
        </Ariakit.ComboboxProvider>
      ) : (
        select
      )}
    </div>
  );
}

export const Select = Object.assign(SelectRoot, { Item: SelectItem });
