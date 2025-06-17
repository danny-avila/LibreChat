import { TransportOptions, SendMailOptions } from 'nodemailer';
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

export interface MailgunEmailParams {
  to: string;
  from: string;
  subject: string;
  html: string;
}

export interface MailgunResponse {
  id: string;
  message: string;
}

export interface SMTPParams {
  transporterOptions: any;
  mailOptions: SendMailOptions;
}
