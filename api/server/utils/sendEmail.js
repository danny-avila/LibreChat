const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

const sendEmail = async (email, subject, payload, template) => {
  try {
    const transporter = nodemailer.createTransport({
      // service: process.env.EMAIL_SERVICE,
      host: process.env.EMAIL_SMTP_HOST,
      port: process.env.EMAIL_SMTP_PORT,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const source = fs.readFileSync(path.join(__dirname, 'emails', template), 'utf8');
    const compiledTemplate = handlebars.compile(source);
    const html = compiledTemplate(payload);
    const options = () => {
      return {
        from: process.env.EMAIL_FROM,
        to: email,
        subject: subject,
        html: html,
      };
    };

    // Send email
    transporter.sendMail(options(), (error, info) => {
      if (error) {
        console.log(error);
        return error;
      } else {
        console.log(info);
        return info;
      }
    });
  } catch (error) {
    console.log(error);
    return error;
  }
};

module.exports = sendEmail;
