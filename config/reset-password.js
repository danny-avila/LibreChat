const path = require('path');
const bcrypt = require('bcryptjs');
const readline = require('readline');
const mongoose = require('mongoose');
const { User, Passkey } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

const resetPassword = async () => {
  try {
    await connect();

    const email = await question('Enter user email: ');
    const user = await User.findOne({ email });

    if (!user) {
      console.error('User not found!');
      process.exit(1);
    }

    let validPassword = false;
    let newPassword;

    while (!validPassword) {
      newPassword = await question('Enter new password: ');
      if (newPassword.length < 8) {
        console.log('Password must be at least 8 characters! Please try again.');
        continue;
      }

      const confirmPassword = await question('Confirm new password: ');
      if (newPassword !== confirmPassword) {
        console.log('Passwords do not match! Please try again.');
        continue;
      }

      validPassword = true;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await User.updateOne(
      { email },
      {
        password: hashedPassword,
        passwordVersion: Date.now(), // Invalidate old sessions
      },
    );

    /**
     * A passkey signs in on its own, so leaving one in place would keep an attacker
     * logged in after an administrator believes the account has been recovered.
     */
    const { deletedCount } = await Passkey.deleteMany({ user: user._id });

    console.log('Password successfully reset!');
    if (deletedCount > 0) {
      console.log(`Removed ${deletedCount} passkey(s); the user must enroll again.`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Error resetting password:', err);
    process.exit(1);
  } finally {
    rl.close();
  }
};

resetPassword();
