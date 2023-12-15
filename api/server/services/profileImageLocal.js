const fs = require('fs').promises;
const config = require('../../../config/loader');
const domains = config.domains;

async function saveToLocal(userId, webPBuffer, oldUser, manual) {
  const urlLocal = `./images/${userId}/profilePicture.png`;
  const urlRoute = `${domains.server}/api/profilePicture/${userId}/`;

  await fs.mkdir(`./images/${userId}`, { recursive: true });
  await fs.writeFile(urlLocal, webPBuffer);

  if (manual === 'true') {
    const url = `./images/${userId}/profilePicture_manual=true.png`;
    await fs.rename(urlLocal, url);
    oldUser.avatar = urlRoute;
    await oldUser.save();
    return urlRoute;
  } else {
    return urlRoute;
  }
}

module.exports = { saveToLocal };
