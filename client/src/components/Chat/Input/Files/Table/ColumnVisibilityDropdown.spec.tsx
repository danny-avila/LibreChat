import React, { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
import '@testing-library/jest-dom';
import type { VisibilityState } from '@tanstack/react-table';
import type { TranslationKeys } from '~/hooks';
import { ColumnVisibilityDropdown } from './ColumnVisibilityDropdown';

/** The real `useLocalize` hands back a `useCallback`-stable function, so the
 * mock must return one identity too — a fresh closure per render would
 * invalidate the dropdown's `useMemo` on its own and hide the regression. */
const mockLocalize = (key: string): string => key;

jest.mock('~/hooks', () => ({
  useLocalize: () => mockLocalize,
}));

type Row = { filename: string; bytes: number };

const contextMap: Record<string, TranslationKeys> = {
  filename: 'com_ui_name',
  bytes: 'com_ui_size',
};

/** Mirrors how `DataTable` drives the table, so column visibility lives in
 * React state above the dropdown and a toggle re-renders the parent. */
function Harness() {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const table = useReactTable<Row>({
    data: [{ filename: 'a.png', bytes: 1 }],
    columns: [
      { accessorKey: 'filename', header: 'filename' },
      { accessorKey: 'bytes', header: 'bytes' },
    ],
    getCoreRowModel: getCoreRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: { columnVisibility },
  });

  return <ColumnVisibilityDropdown table={table} contextMap={contextMap} isSmallScreen={false} />;
}

const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'com_files_filter_by' }));
};

const nameOption = () => screen.getByRole('menuitemcheckbox', { name: 'com_ui_name' });

describe('ColumnVisibilityDropdown', () => {
  it('clears the checkmark once a visible column is deselected', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openMenu(user);
    expect(nameOption()).toBeChecked();

    await user.click(nameOption());
    await openMenu(user);

    expect(nameOption()).not.toBeChecked();
  });

  it('tracks the checkmark across successive toggles of the same column', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openMenu(user);
    await user.click(nameOption());
    await openMenu(user);
    expect(nameOption()).not.toBeChecked();

    await user.click(nameOption());
    await openMenu(user);
    expect(nameOption()).toBeChecked();
  });

  it('only updates the column that was toggled', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openMenu(user);
    await user.click(nameOption());
    await openMenu(user);

    expect(nameOption()).not.toBeChecked();
    expect(screen.getByRole('menuitemcheckbox', { name: 'com_ui_size' })).toBeChecked();
  });
});
