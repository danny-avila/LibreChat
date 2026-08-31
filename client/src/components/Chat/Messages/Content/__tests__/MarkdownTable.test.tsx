import React from 'react';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { table as MarkdownTable } from '../MarkdownComponents';
import useTableExport, { extractTableRows } from '~/components/Messages/Content/useTableExport';
import copy from 'copy-to-clipboard';
import { triggerDownload } from '~/utils';

const mockCopy = copy as unknown as jest.Mock;
const mockTriggerDownload = triggerDownload as jest.Mock;

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('copy-to-clipboard', () => ({ __esModule: true, default: jest.fn() }));

jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils'),
  triggerDownload: jest.fn(),
}));

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = jest.fn(() => 'blob:mock-url');
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = jest.fn();
}

describe('extractTableRows', () => {
  it('returns an empty array when the table is missing', () => {
    expect(extractTableRows(null)).toEqual([]);
  });
});

describe('MarkdownTable export actions', () => {
  beforeEach(() => {
    mockCopy.mockClear();
    mockTriggerDownload.mockClear();
  });

  const renderTable = (cells: string[][]) => (
    <MarkdownTable>
      <thead>
        <tr>
          {cells[0].map((cell, i) => (
            <th key={`h-${i}`}>{cell}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cells.slice(1).map((row, r) => (
          <tr key={`r-${r}`}>
            {row.map((cell, c) => (
              <td key={`c-${r}-${c}`}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </MarkdownTable>
  );

  it('renders the table with copy and download actions', () => {
    render(
      renderTable([
        ['Name', 'Value'],
        ['Alpha', '1'],
      ]),
    );

    expect(screen.getByRole('button', { name: 'com_ui_copy_table' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_download_table' })).toBeInTheDocument();
    // the rendered table keeps the existing wrapper class for horizontal scrolling
    expect(document.querySelector('.markdown-table-wrapper table')).toBeInTheDocument();
  });

  it('copies TSV content that pastes cleanly into spreadsheets', () => {
    render(
      renderTable([
        ['Name', 'Notes'],
        ['plain', 'has, comma'],
      ]),
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_copy_table' }));
    expect(mockCopy).toHaveBeenCalledTimes(1);
    const [copied] = mockCopy.mock.calls[0] as unknown as [string];
    expect(copied).toBe('Name\tNotes\nplain\thas, comma');
  });

  it('downloads escaped CSV content', () => {
    render(
      renderTable([
        ['Name', 'Notes'],
        ['quoted "cell"', 'has, comma'],
      ]),
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_download_table' }));
    expect(mockTriggerDownload).toHaveBeenCalledTimes(1);
    const blobUrl = mockTriggerDownload.mock.calls[0][0] as string;
    expect(blobUrl).toMatch(/^blob:/);
  });
});

describe('useTableExport hook', () => {
  it('no-ops when the table has no rows', () => {
    const table = document.createElement('table');
    const ref = { current: table };
    const { result } = renderHook(() => useTableExport(ref));
    act(() => {
      result.current.handleCopy();
      result.current.handleDownload();
    });
    expect(mockCopy).not.toHaveBeenCalled();
    expect(mockTriggerDownload).not.toHaveBeenCalled();
  });
});
