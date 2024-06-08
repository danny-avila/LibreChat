const { getInvite } = require('~/models/inviteUser');

function checkInviteUser(req, res, next) {
  const token = req.body.token;

  if (!token || token === 'undefined') {
    console.log('No token provided');
    next();
    return;
  }

  getInvite(token)
    .then((invite) => {
      console.log('Invite:', invite);
      if (invite) {
        req.invite = invite;
        next();
      } else {
        res.status(400).json({ message: 'Invalid invite' });
      }
    })
    .catch((error) => {
      return res.status(400).json({ message: error.message });
    });
}

module.exports = checkInviteUser;
