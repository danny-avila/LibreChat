const bcrypt = require('bcryptjs');
const express = require('express');
const { requireAdmin } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { createInvite } = require('~/models/inviteUser');
const { sendEmail } = require('~/server/utils');
const middleware = require('~/server/middleware');
const { User } = require('~/db/models');

const router = express.Router();

router.use(middleware.requireJwtAuth, requireAdmin);

router.get('/', async (req, res) => {
  try {
    const users = await User.find(
      {},
      { name: 1, email: 1, role: 1, createdAt: 1, suspended: 1 },
    ).sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (error) {
    logger.error('[admin/users] Error fetching users', error);
    res.status(500).json({ message: 'Fehler beim Laden der Benutzer' });
  }
});

router.post('/invite', async (req, res) => {
  const { email, name } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ message: 'Ungültige E-Mail-Adresse' });
  }

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'Ein Benutzer mit dieser E-Mail existiert bereits' });
    }

    const token = await createInvite(email);
    const inviteLink = `${process.env.DOMAIN_CLIENT}/register?token=${token}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name || '')}`;
    const appName = process.env.APP_TITLE || 'KARRIERE.MUM AI';

    await sendEmail({
      email,
      subject: `Einladung zu ${appName}`,
      payload: {
        appName,
        inviteLink,
        name: name || '',
        year: new Date().getFullYear(),
        appUrl: process.env.DOMAIN_CLIENT || '',
      },
      template: 'inviteUser.handlebars',
    });

    res.status(200).json({ message: 'Einladung erfolgreich gesendet' });
  } catch (error) {
    logger.error('[admin/users/invite] Error sending invite', error);
    res.status(500).json({ message: 'Fehler beim Senden der Einladung' });
  }
});

router.patch('/:id/role', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (req.user?.id === id || String(req.user?._id) === id) {
    return res.status(400).json({ message: 'Du kannst deine eigene Rolle nicht ändern' });
  }

  if (!['ADMIN', 'USER', 'TEAM'].includes(role)) {
    return res.status(400).json({ message: 'Ungültige Rolle' });
  }

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Benutzer nicht gefunden' });
    }

    user.role = role;
    await user.save();

    res.status(200).json({ message: 'Rolle erfolgreich geändert', role });
  } catch (error) {
    logger.error('[admin/users/role] Error updating role', error);
    res.status(500).json({ message: 'Fehler beim Ändern der Rolle' });
  }
});

router.patch('/:id/suspend', async (req, res) => {
  const { id } = req.params;

  if (req.user?.id === id || String(req.user?._id) === id) {
    return res.status(400).json({ message: 'Du kannst deinen eigenen Account nicht sperren' });
  }

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Benutzer nicht gefunden' });
    }

    if (user.role === 'ADMIN') {
      return res.status(403).json({ message: 'Admin-Accounts können nicht gesperrt werden' });
    }

    user.suspended = !user.suspended;
    await user.save();

    res.status(200).json({
      message: user.suspended ? 'Benutzer gesperrt' : 'Sperre aufgehoben',
      suspended: user.suspended,
    });
  } catch (error) {
    logger.error('[admin/users/suspend] Error toggling suspension', error);
    res.status(500).json({ message: 'Fehler beim Sperren des Benutzers' });
  }
});

router.patch('/:id/password', async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  if (!password || password.length < 8) {
    return res.status(400).json({ message: 'Das Passwort muss mindestens 8 Zeichen lang sein' });
  }

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Benutzer nicht gefunden' });
    }

    user.password = bcrypt.hashSync(password, 10);
    await user.save();

    logger.info(
      `[admin/users/password] Password set by admin. [Target user ID: ${id}] [Admin: ${req.user?.email}]`,
    );
    res.status(200).json({ message: 'Passwort erfolgreich gesetzt' });
  } catch (error) {
    logger.error('[admin/users/password] Error setting password', error);
    res.status(500).json({ message: 'Fehler beim Setzen des Passworts' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  if (req.user?.id === id || String(req.user?._id) === id) {
    return res.status(400).json({ message: 'Du kannst deinen eigenen Account nicht löschen' });
  }

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Benutzer nicht gefunden' });
    }

    if (user.role === 'ADMIN') {
      return res.status(403).json({ message: 'Admin-Accounts können nicht gelöscht werden' });
    }

    await User.findByIdAndDelete(id);
    res.status(200).json({ message: 'Benutzer erfolgreich gelöscht' });
  } catch (error) {
    logger.error('[admin/users/delete] Error deleting user', error);
    res.status(500).json({ message: 'Fehler beim Löschen des Benutzers' });
  }
});

module.exports = router;
