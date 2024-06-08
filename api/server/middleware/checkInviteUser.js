const { getInvite } = require('~/models/inviteUser');

function checkInviteUser(req, res, next) {
  const token = req.query.token;
  if (!token) {
    next();
  }

  getInvite(token)
    .then((invite) => {
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
