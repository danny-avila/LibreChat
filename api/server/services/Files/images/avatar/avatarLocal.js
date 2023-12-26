const fs = require('fs').promises;

async function saveToLocal(userId, webPBuffer, oldUser) {
  const url = `./client/public/images/${userId}/avatar.png`;
  // Adjust the urlRoute to match the desired format
  const urlRoute = `/images/${userId}/avatar.png`;

  await fs.mkdir(`./images/${userId}`, { recursive: true });
  await fs.writeFile(url, webPBuffer);

  oldUser.avatar = urlRoute;
  await oldUser.save();
  return urlRoute;
}

module.exports = { saveToLocal };
