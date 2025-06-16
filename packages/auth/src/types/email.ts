export interface SendEmailParams {
  email: string;
  subject: string;
  payload: Record<string, string | number>;
  template: string;
  throwError?: boolean;
}

export interface SendEmailResponse {
  accepted: string[];
  rejected: string[];
  response: string;
  envelope: { from: string; to: string[] };
  messageId: string;
}
