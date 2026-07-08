import {
  extractQuickBooksRealmId,
  listQuickBooksInvoices,
  type QuickBooksConnectionContext,
} from './quickbooksApi';

describe('quickbooksApi', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;
  const context: QuickBooksConnectionContext = {
    accessToken: 'token-123',
    realmId: 'realm-456',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('extractQuickBooksRealmId reads realm_id from connection_config', () => {
    expect(
      extractQuickBooksRealmId({
        connection_config: { realm_id: '12345' },
      }),
    ).toBe('12345');
  });

  it('listQuickBooksInvoices queries open invoices when openOnly is true', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        QueryResponse: {
          Invoice: [
            {
              Id: '1',
              DocNumber: 'INV-1',
              Balance: 50,
              TotalAmt: 100,
              CustomerRef: { name: 'Acme' },
            },
          ],
        },
      }),
    } as unknown as Response);

    const invoices = await listQuickBooksInvoices(context, {
      maxResults: 5,
      openOnly: true,
    });

    expect(invoices).toEqual([
      expect.objectContaining({
        id: '1',
        docNumber: 'INV-1',
        customerName: 'Acme',
        balance: '50',
        totalAmount: '100',
      }),
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v3/company/realm-456/query?query='),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      }),
    );
    const calledUrl = String(mockFetch.mock.calls[0]?.[0]);
    expect(decodeURIComponent(calledUrl)).toContain("Balance > '0'");
  });
});
