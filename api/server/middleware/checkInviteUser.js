const { getInvite } = require('~/models/inviteUser');
const { deleteTokens } = require('~/models');

async function checkInviteUser(req, res, next) {
  const token = req.body.token;

  if (!token || token === 'undefined') {
    next();
    return;
  }

  try {
    const invite = await getInvite(token, req.body.email);

    if (!invite || invite.error === true) {
      return res.status(400).json({ message: 'Invalid invite token' });
    }

    await deleteTokens({ token: invite.token });
    req.invite = invite;
    next();
  } catch (error) {
    return res.status(429).json({ message: error.message });
  }
}

module.exports = checkInviteUser;
