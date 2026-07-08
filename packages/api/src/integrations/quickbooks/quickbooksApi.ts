const QBO_API_BASE =
  process.env.QUICKBOOKS_API_BASE_URL?.trim() || 'https://quickbooks.api.intuit.com';

export type QuickBooksToolAction =
  | 'list_invoices'
  | 'list_customers'
  | 'list_payments'
  | 'list_expenses';

export interface QuickBooksConnectionContext {
  accessToken: string;
  realmId: string;
}

export interface QuickBooksInvoiceSummary {
  id: string;
  docNumber?: string;
  customerName?: string;
  totalAmount?: string;
  balance?: string;
  dueDate?: string;
  txnDate?: string;
}

export interface QuickBooksCustomerSummary {
  id: string;
  displayName: string;
  companyName?: string;
  email?: string;
  balance?: string;
}

export interface QuickBooksPaymentSummary {
  id: string;
  totalAmount?: string;
  txnDate?: string;
  customerName?: string;
}

export interface QuickBooksExpenseSummary {
  id: string;
  totalAmount?: string;
  txnDate?: string;
  paymentType?: string;
  accountName?: string;
}

export interface QuickBooksListOptions {
  maxResults?: number;
  openOnly?: boolean;
}

type QboQueryResponse<T> = {
  QueryResponse?: Record<string, T[] | number | undefined>;
};

type NangoConnectionShape = {
  connection_config?: { realm_id?: string; realmId?: string };
  credentials?: {
    raw?: { realm_id?: string; realmId?: string };
  };
};

function clampMaxResults(maxResults?: number): number {
  return Math.min(Math.max(maxResults ?? 10, 1), 50);
}

export function extractQuickBooksRealmId(connection: NangoConnectionShape): string | undefined {
  const candidates = [
    connection.connection_config?.realm_id,
    connection.connection_config?.realmId,
    connection.credentials?.raw?.realm_id,
    connection.credentials?.raw?.realmId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return undefined;
}

async function qboQuery<T>(
  context: QuickBooksConnectionContext,
  sql: string,
): Promise<QboQueryResponse<T>> {
  const url = `${QBO_API_BASE}/v3/company/${encodeURIComponent(context.realmId)}/query?query=${encodeURIComponent(sql)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${context.accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`QuickBooks API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<QboQueryResponse<T>>;
}

function getEntityRows<T>(payload: QboQueryResponse<T>, entityKey: string): T[] {
  const rows = payload.QueryResponse?.[entityKey];
  return Array.isArray(rows) ? rows : [];
}

type QboInvoice = {
  Id?: string;
  DocNumber?: string;
  TotalAmt?: number;
  Balance?: number;
  DueDate?: string;
  TxnDate?: string;
  CustomerRef?: { name?: string };
};

type QboCustomer = {
  Id?: string;
  DisplayName?: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address?: string };
  Balance?: number;
};

type QboPayment = {
  Id?: string;
  TotalAmt?: number;
  TxnDate?: string;
  CustomerRef?: { name?: string };
};

type QboPurchase = {
  Id?: string;
  TotalAmt?: number;
  TxnDate?: string;
  PaymentType?: string;
  AccountRef?: { name?: string };
};

function formatAmount(value?: number): string | undefined {
  return value == null ? undefined : String(value);
}

export async function listQuickBooksInvoices(
  context: QuickBooksConnectionContext,
  options: QuickBooksListOptions = {},
): Promise<QuickBooksInvoiceSummary[]> {
  const maxResults = clampMaxResults(options.maxResults);
  const openClause = options.openOnly ? " where Balance > '0'" : '';
  const sql = `select * from Invoice${openClause} maxresults ${maxResults}`;
  const payload = await qboQuery<QboInvoice>(context, sql);

  return getEntityRows(payload, 'Invoice').map((invoice) => ({
    id: String(invoice.Id ?? ''),
    docNumber: invoice.DocNumber,
    customerName: invoice.CustomerRef?.name,
    totalAmount: formatAmount(invoice.TotalAmt),
    balance: formatAmount(invoice.Balance),
    dueDate: invoice.DueDate,
    txnDate: invoice.TxnDate,
  }));
}

export async function listQuickBooksCustomers(
  context: QuickBooksConnectionContext,
  options: QuickBooksListOptions = {},
): Promise<QuickBooksCustomerSummary[]> {
  const maxResults = clampMaxResults(options.maxResults);
  const sql = `select * from Customer maxresults ${maxResults}`;
  const payload = await qboQuery<QboCustomer>(context, sql);

  return getEntityRows(payload, 'Customer').map((customer) => ({
    id: String(customer.Id ?? ''),
    displayName: customer.DisplayName ?? '',
    companyName: customer.CompanyName,
    email: customer.PrimaryEmailAddr?.Address,
    balance: formatAmount(customer.Balance),
  }));
}

export async function listQuickBooksPayments(
  context: QuickBooksConnectionContext,
  options: QuickBooksListOptions = {},
): Promise<QuickBooksPaymentSummary[]> {
  const maxResults = clampMaxResults(options.maxResults);
  const sql = `select * from Payment maxresults ${maxResults}`;
  const payload = await qboQuery<QboPayment>(context, sql);

  return getEntityRows(payload, 'Payment').map((payment) => ({
    id: String(payment.Id ?? ''),
    totalAmount: formatAmount(payment.TotalAmt),
    txnDate: payment.TxnDate,
    customerName: payment.CustomerRef?.name,
  }));
}

export async function listQuickBooksExpenses(
  context: QuickBooksConnectionContext,
  options: QuickBooksListOptions = {},
): Promise<QuickBooksExpenseSummary[]> {
  const maxResults = clampMaxResults(options.maxResults);
  const sql = `select * from Purchase maxresults ${maxResults}`;
  const payload = await qboQuery<QboPurchase>(context, sql);

  return getEntityRows(payload, 'Purchase').map((expense) => ({
    id: String(expense.Id ?? ''),
    totalAmount: formatAmount(expense.TotalAmt),
    txnDate: expense.TxnDate,
    paymentType: expense.PaymentType,
    accountName: expense.AccountRef?.name,
  }));
}

export async function runQuickBooksAction(
  context: QuickBooksConnectionContext,
  action: QuickBooksToolAction,
  options: QuickBooksListOptions = {},
): Promise<unknown> {
  switch (action) {
    case 'list_invoices':
      return listQuickBooksInvoices(context, options);
    case 'list_customers':
      return listQuickBooksCustomers(context, options);
    case 'list_payments':
      return listQuickBooksPayments(context, options);
    case 'list_expenses':
      return listQuickBooksExpenses(context, options);
    default:
      throw new Error(`Unsupported QuickBooks action: ${action}`);
  }
}
