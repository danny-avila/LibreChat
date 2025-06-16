import fs from 'fs';
import path from 'path';
import nodemailer, { TransportOptions } from 'nodemailer';
import handlebars from 'handlebars';
import { createTokenHash, isEnabled } from '.';
import { IUser, logger } from '@librechat/data-schemas';
import { getMethods } from '../initAuth';
import { ObjectId } from 'mongoose';
import bcrypt from 'bcryptjs';
import { Request } from 'express';
import { SendEmailParams, SendEmailResponse } from '../types/email';

const genericVerificationMessage = 'Please check your email to verify your email address.';
const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};
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

    const templatePath = path.join(__dirname, 'utils/', template);
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
