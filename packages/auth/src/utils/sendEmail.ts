import fs from 'fs';
import path from 'path';
import nodemailer, { TransportOptions } from 'nodemailer';
import handlebars from 'handlebars';
import logger from '../config/winston';
import { isEnabled } from '.';

interface SendEmailParams {
  email: string;
  subject: string;
  payload: Record<string, string | number>;
  template: string;
  throwError?: boolean;
}

interface SendEmailResponse {
  accepted: string[];
  rejected: string[];
  response: string;
  envelope: { from: string; to: string[] };
  messageId: string;
}

export const sendEmail = async ({
  email,
  subject,
  payload,
  template,
  throwError = true,
}: SendEmailParams): Promise<SendEmailResponse | Error> => {
  try {
    const transporterOptions: TransportOptions = {
      secure: process.env.EMAIL_ENCRYPTION === 'tls',
      requireTLS: process.env.EMAIL_ENCRYPTION === 'starttls',
      tls: {
        rejectUnauthorized: !isEnabled(process.env.EMAIL_ALLOW_SELFSIGNED ?? ''),
      },
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    };

    if (process.env.EMAIL_ENCRYPTION_HOSTNAME) {
      transporterOptions.tls = {
        ...transporterOptions.tls,
        servername: process.env.EMAIL_ENCRYPTION_HOSTNAME,
      };
    }

    if (process.env.EMAIL_SERVICE) {
      transporterOptions.service = process.env.EMAIL_SERVICE;
    } else {
      transporterOptions.host = process.env.EMAIL_HOST;
      transporterOptions.port = Number(process.env.EMAIL_PORT ?? 25);
    }

    const transporter = nodemailer.createTransport(transporterOptions);

    const templatePath = path.join(__dirname, 'emails', template);
    const source = fs.readFileSync(templatePath, 'utf8');
    const compiledTemplate = handlebars.compile(source);

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || process.env.APP_TITLE}" <${process.env.EMAIL_FROM}>`,
      to: `"${payload.name}" <${email}>`,
      envelope: {
        from: process.env.EMAIL_FROM!,
        to: email,
      },
      subject,
      html: compiledTemplate(payload),
    };

    return await transporter.sendMail(mailOptions);
  } catch (error: any) {
    if (throwError) {
      throw error;
    }
    logger.error('[sendEmail]', error);
    return error;
  }
};
