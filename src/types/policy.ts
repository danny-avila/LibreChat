export type Policy = {
  org_id: string;
  name: string;
  description: string;
  statements: Statement[];
  report_enabled: boolean;
  report_destination: string;
  raw_str: string;
  api_version: "alpha/v1" | string;
};

export type Statement = {
  action: string;
  target: string;
  matcher_kind: string;
  matcher_terms: string[];
};
