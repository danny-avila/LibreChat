const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const { isEnabled } = require('~/server/utils/handleText');
const logger = require('~/config/winston');

const sendEmail = async (email, subject, payload, template) => {
  try {
    const transporterOptions = {
      // Use STARTTLS by default instead of obligatory TLS
      secure: process.env.EMAIL_ENCRYPTION === 'tls',
      // If explicit STARTTLS is set, require it when connecting
      requireTls: process.env.EMAIL_ENCRYPTION === 'starttls',
      tls: {
        // Whether to accept unsigned certificates
        rejectUnauthorized: !isEnabled(process.env.EMAIL_ALLOW_SELFSIGNED),
      },
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    };

    if (process.env.EMAIL_ENCRYPTION_HOSTNAME) {
      // Check the certificate against this name explicitly
      transporterOptions.tls.servername = process.env.EMAIL_ENCRYPTION_HOSTNAME;
    }

    // Mailer service definition has precedence
    if (process.env.EMAIL_SERVICE) {
      transporterOptions.service = process.env.EMAIL_SERVICE;
    } else {
      transporterOptions.host = process.env.EMAIL_HOST;
      transporterOptions.port = process.env.EMAIL_PORT ?? 25;
    }

    const transporter = nodemailer.createTransport(transporterOptions);

    const source = fs.readFileSync(path.join(__dirname, 'emails', template), 'utf8');
    const compiledTemplate = handlebars.compile(source);
    const options = () => {
      return {
        // Header address should contain name-addr
        from:
          `"${process.env.EMAIL_FROM_NAME || process.env.APP_TITLE}"` +
          `<${process.env.EMAIL_FROM}>`,
        to: `"${payload.name}" <${email}>`,
        envelope: {
          // Envelope from should contain addr-spec
          // Mistake in the Nodemailer documentation?
          from: process.env.EMAIL_FROM,
          to: email,
        },
        subject: subject,
        html: compiledTemplate(payload),
      };
    };

    // Send email
    transporter.sendMail(options(), (error, info) => {
      if (error) {
        logger.error('[sendEmail]', error);
        return error;
      } else {
        logger.debug('[sendEmail]', info);
        return info;
      }
    });
  } catch (error) {
    logger.error('[sendEmail]', error);
    return error;
  }
};

module.exports = sendEmail;
