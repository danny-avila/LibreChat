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
      { name: 1, email: 1, role: 1, createdAt: 1 },
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
    const inviteLink = `${process.env.DOMAIN_CLIENT}/register?token=${token}&email=${encodeURIComponent(email)}`;
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
