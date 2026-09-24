/** The window the dashboard asks for. `from`/`to` are calendar days in `timeZone`. */
export interface UsageRange {
  from: string;
  to: string;
  timeZone: string;
}

/** The single user the dashboard is drilled into, or `null` for everyone. */
export interface UsageFocus {
  userId: string;
  label: string;
}

/** One `{ credits, tokens, transactions }` total keyed by whatever the panel groups on. */
export interface UsageSlice {
  key: string;
  label: string;
  secondary: string;
  credits: number;
  tokens: number;
  transactions: number;
}
