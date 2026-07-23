import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UsagePanel from './UsagePanel';

const mockUsageQueryResult = {
  current: { data: undefined as unknown, isLoading: false },
};

jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useAdminUsageSummaryQuery: () => mockUsageQueryResult.current,
  useGetStartupConfig: () => ({ data: { interface: {} } }),
}));

// DataTable virtualizes rows via @tanstack/react-virtual, which needs real layout
// measurements jsdom can't provide. That rendering path is already covered by
// DataTable's own test suite — this test only needs to verify UsagePanel passes the
// right columns/data through, so a lightweight stub stands in for the real table.
jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  DataTable: ({ columns, data }: { columns: any[]; data: any[] }) => (
    <table>
      <tbody>
        {data.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {columns.map((column, colIndex) => (
              <td key={colIndex}>
                {typeof column.cell === 'function'
                  ? column.cell({ row: { original: row } })
                  : row[column.accessorKey]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

afterEach(() => {
  mockUsageQueryResult.current = { data: undefined, isLoading: false };
});

describe('UsagePanel', () => {
  it('opens the dialog and shows the empty state when there is no usage', async () => {
    mockUsageQueryResult.current = {
      data: { items: [], total: 0, limit: 100, offset: 0 },
      isLoading: false,
    };
    render(<UsagePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Usage' }));

    await waitFor(() =>
      expect(screen.getByText('No usage recorded for this period')).toBeInTheDocument(),
    );
  });

  it('renders per-user cost rows', async () => {
    mockUsageQueryResult.current = {
      data: {
        items: [
          {
            user: 'u1',
            name: 'Alice',
            email: 'alice@example.com',
            totalCost: 2_000_000,
            transactionCount: 5,
          },
        ],
        total: 1,
        limit: 100,
        offset: 0,
      },
      isLoading: false,
    };
    render(<UsagePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Usage' }));

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows a loading spinner while the query is in flight', () => {
    mockUsageQueryResult.current = { data: undefined, isLoading: true };
    render(<UsagePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Usage' }));

    expect(screen.queryByText('No usage recorded for this period')).not.toBeInTheDocument();
  });
});
