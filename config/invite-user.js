const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { sendEmail, checkEmailConfig } = require('~/server/utils');
const { askQuestion, silentExit } = require('./helpers');
const { createInvite } = require('~/models/inviteUser');
const User = require('~/models/User');
const connect = require('./connect');

(async () => {
  await connect();

  console.purple('--------------------------');
  console.purple('¡Invitar a un nuevo usuario!');
  console.purple('--------------------------');

  if (process.argv.length < 5) {
    console.orange('Uso: npm run invite-user <email>');
    console.orange('Nota: si no pasas los argumentos, se te solicitarán.');
    console.purple('--------------------------');
  }

  // Check if email service is enabled
  if (!checkEmailConfig()) {
    console.red('Error: ¡El servicio de correo electrónico no está habilitado!');
    silentExit(1);
  }

  // Get the email of the user to be invited
  let email = '';
  if (process.argv.length >= 3) {
    email = process.argv[2];
  }
  if (!email) {
    email = await askQuestion('Correo electrónico:');
  }
  // Validate the email
  if (!email.includes('@')) {
    console.red('Error: ¡Dirección de correo electrónico inválida!');
    silentExit(1);
  }

  // Check if the user already exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    console.red('Error: ¡Ya existe un usuario con ese correo electrónico!');
    silentExit(1);
  }

  const token = await createInvite(email);
  const inviteLink = `${process.env.DOMAIN_CLIENT}/register?token=${token}`;

  const appName = process.env.APP_TITLE || 'LibreChat';

  if (!checkEmailConfig()) {
    console.green('Envía este enlace al usuario:', inviteLink);
    silentExit(0);
  }

  try {
    await sendEmail({
      email: email,
      subject: `¡Ya puedes unirte a AVI!`,
      payload: {
        appName: appName,
        inviteLink: inviteLink,
        year: new Date().getFullYear(),
      },
      template: 'inviteUser.handlebars',
    });
  } catch (error) {
    console.error('Error: ' + error.message);
    silentExit(1);
  }

  // Done!
  console.green('¡Invitación enviada exitosamente!');
  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
  }

  if (err.message.includes('fetch failed')) {
    return;
  } else {
    process.exit(1);
  }
});
