const fs = require('fs').promises;
const path = require('path');

async function localStrategy(userId, webPBuffer, oldUser, manual) {
  const userDir = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    '..',
    'client',
    'public',
    'images',
    userId,
  );
  let avatarPath = path.join(userDir, 'avatar.png');
  const urlRoute = `/images/${userId}/avatar.png`;
  await fs.mkdir(userDir, { recursive: true });
  await fs.writeFile(avatarPath, webPBuffer);
  const isManual = manual === 'true';
  let url = `${urlRoute}?manual=${isManual}&timestamp=${new Date().getTime()}`;
  if (isManual) {
    oldUser.avatar = url;
    await oldUser.save();
  }

  return url;
}

module.exports = localStrategy;
