import fs from 'fs';
import path from 'path';
import nodemailer, { SentMessageInfo } from 'nodemailer';
import handlebars from 'handlebars';
import { createTokenHash } from '.';
import {  logAxiosError } from '@librechat/api';
import { isEnabled } from '.';
import { IUser, logger } from '@librechat/data-schemas';
import { getMethods } from '../initAuth';
import { ObjectId } from 'mongoose';
import bcrypt from 'bcryptjs';
import { Request } from 'express';
import FormData from 'form-data';
import axios, { AxiosResponse } from 'axios';
import { MailgunEmailParams, SendEmailParams, SMTPParams } from '../types/email';

const genericVerificationMessage = 'Please check your email to verify your email address.';
const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};

/**
 * Sends an email using Mailgun API.
 *
 * @async
 * @function sendEmailViaMailgun
 * @param {Object} params - The parameters for sending the email.
 * @param {string} params.to - The recipient's email address.
 * @param {string} params.from - The sender's email address.
 * @param {string} params.subject - The subject of the email.
 * @param {string} params.html - The HTML content of the email.
 * @returns {Promise<Object>} - A promise that resolves to the response from Mailgun API.
 */
const sendEmailViaMailgun = async ({
  to,
  from,
  subject,
  html,
}: MailgunEmailParams): Promise<SentMessageInfo> => {
  const mailgunApiKey: string | undefined = process.env.MAILGUN_API_KEY;
  const mailgunDomain: string | undefined = process.env.MAILGUN_DOMAIN;
  const mailgunHost: string = process.env.MAILGUN_HOST || 'smtp.mailgun.org';

  if (!mailgunApiKey || !mailgunDomain) {
    throw new Error('Mailgun API key and domain are required');
  }

  const formData = new FormData();
  formData.append('from', from);
  formData.append('to', to);
  formData.append('subject', subject);
  formData.append('html', html);
  formData.append('o:tracking-clicks', 'no');

  try {
    const response = await axios.post(`${mailgunHost}/v3/${mailgunDomain}/messages`, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Basic ${Buffer.from(`api:${mailgunApiKey}`).toString('base64')}`,
      },
    });

    return response.data;
  } catch (error: any) {
    throw new Error(logAxiosError({ error, message: 'Failed to send email via Mailgun' }));
  }
};

/**
 * Sends an email using SMTP via Nodemailer.
 *
 * @async
 * @function sendEmailViaSMTP
 * @param {Object} params - The parameters for sending the email.
 * @param {Object} params.transporterOptions - The transporter configuration options.
 * @param {Object} params.mailOptions - The email options.
 * @returns {Promise<Object>} - A promise that resolves to the info object of the sent email.
 */
const sendEmailViaSMTP = async ({
  transporterOptions,
  mailOptions,
}: SMTPParams): Promise<SentMessageInfo> => {
  const transporter = nodemailer.createTransport(transporterOptions);
  return await transporter.sendMail(mailOptions);
};
export const sendEmail = async ({
  email,
  subject,
  payload,
  template,
  throwError = true,
}: SendEmailParams): Promise<SentMessageInfo | Error> => {
  try {
    // Read and compile the email template
    const source = fs.readFileSync(path.join(__dirname, 'emails', template), 'utf8');
    const compiledTemplate = handlebars.compile(source);
    const html = compiledTemplate(payload);

    // Prepare common email data
    const fromName = process.env.EMAIL_FROM_NAME || process.env.APP_TITLE;
    const fromEmail = process.env.EMAIL_FROM;
    const fromAddress = `"${fromName}" <${fromEmail}>`;
    const toAddress = `"${payload.name}" <${email}>`;

    // Check if Mailgun is configured
    if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
      logger.debug('[sendEmail] Using Mailgun provider');
      return await sendEmailViaMailgun({
        from: fromAddress,
        to: toAddress,
        subject: subject,
        html: html,
      });
    }

    // Default to SMTP
    logger.debug('[sendEmail] Using SMTP provider');

    const transporterOptions: any = {
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

    const mailOptions = {
      // Header address should contain name-addr
      from: fromAddress,
      to: toAddress,
      envelope: {
        // Envelope from should contain addr-spec
        // Mistake in the Nodemailer documentation?
        from: fromEmail,
        to: email,
      },
      subject: subject,
      html: html,
    };

    return await sendEmailViaSMTP({ transporterOptions, mailOptions });
  } catch (error: any) {
    if (throwError) {
      throw error;
    }
    logger.error('[sendEmail]', error);
    return error;
  }
};

/**
 * Send Verification Email
 * @param {Partial<MongoUser> & { _id: ObjectId, email: string, name: string}} user
 * @returns {Promise<void>}
 */
export const sendVerificationEmail = async (
  user: Partial<IUser> & { _id: ObjectId; email: string },
) => {
  const [verifyToken, hash] = createTokenHash();
  const { createToken } = getMethods();
  const verificationLink = `${
    domains.client
  }/verify?token=${verifyToken}&email=${encodeURIComponent(user.email)}`;
  await sendEmail({
    email: user.email,
    subject: 'Verify your email',
    payload: {
      appName: process.env.APP_TITLE || 'LibreChat',
      name: user.name || user.username || user.email,
      verificationLink: verificationLink,
      year: new Date().getFullYear(),
    },
    template: 'verifyEmail.handlebars',
  });

  await createToken({
    userId: user._id,
    email: user.email,
    token: hash,
    createdAt: Date.now(),
    expiresIn: 900,
  });

  logger.info(`[sendVerificationEmail] Verification link issued. [Email: ${user.email}]`);
};

/**
 * Verify Email
 * @param {Express.Request} req
 */
export const verifyEmail = async (req: Request) => {
  const { email, token } = req.body;
  const decodedEmail = decodeURIComponent(email);
  const { findUser, findToken, updateUser, deleteTokens } = getMethods();

  const user = await findUser({ email: decodedEmail }, 'email _id emailVerified');

  if (!user) {
    logger.warn(`[verifyEmail] [User not found] [Email: ${decodedEmail}]`);
    return new Error('User not found');
  }

  if (user.emailVerified) {
    logger.info(`[verifyEmail] Email already verified [Email: ${decodedEmail}]`);
    return { message: 'Email already verified', status: 'success' };
  }

  let emailVerificationData = await findToken({ email: decodedEmail });

  if (!emailVerificationData) {
    logger.warn(`[verifyEmail] [No email verification data found] [Email: ${decodedEmail}]`);
    return new Error('Invalid or expired password reset token');
  }

  const isValid = bcrypt.compareSync(token, emailVerificationData.token);

  if (!isValid) {
    logger.warn(
      `[verifyEmail] [Invalid or expired email verification token] [Email: ${decodedEmail}]`,
    );
    return new Error('Invalid or expired email verification token');
  }

  const updatedUser = await updateUser(emailVerificationData.userId, { emailVerified: true });

  if (!updatedUser) {
    logger.warn(`[verifyEmail] [User update failed] [Email: ${decodedEmail}]`);
    return new Error('Failed to update user verification status');
  }

  await deleteTokens({ token: emailVerificationData.token });
  logger.info(`[verifyEmail] Email verification successful [Email: ${decodedEmail}]`);
  return { message: 'Email verification was successful', status: 'success' };
};

/**
 * Resend Verification Email
 * @param {Object} req
 * @param {Object} req.body
 * @param {String} req.body.email
 * @returns {Promise<{status: number, message: string}>}
 */
export const resendVerificationEmail = async (req: Request) => {
  try {
    const { deleteTokens, findUser, createToken } = getMethods();
    const { email } = req.body as { email: string };
    await deleteTokens(email);
    const user = await findUser({ email }, 'email _id name');

    if (!user) {
      logger.warn(`[resendVerificationEmail] [No user found] [Email: ${email}]`);
      return { status: 200, message: genericVerificationMessage };
    }

    const [verifyToken, hash] = createTokenHash();

    const verificationLink = `${
      domains.client
    }/verify?token=${verifyToken}&email=${encodeURIComponent(user.email)}`;

    await sendEmail({
      email: user.email,
      subject: 'Verify your email',
      payload: {
        appName: process.env.APP_TITLE || 'LibreChat',
        name: user.name || user.username || user.email,
        verificationLink: verificationLink,
        year: new Date().getFullYear(),
      },
      template: 'verifyEmail.handlebars',
    });

    await createToken({
      userId: user._id,
      email: user.email,
      token: hash,
      createdAt: Date.now(),
      expiresIn: 900,
    });

    logger.info(`[resendVerificationEmail] Verification link issued. [Email: ${user.email}]`);

    return {
      status: 200,
      message: genericVerificationMessage,
    };
  } catch (error: any) {
    logger.error(`[resendVerificationEmail] Error resending verification email: ${error.message}`);
    return {
      status: 500,
      message: 'Something went wrong.',
    };
  }
};
