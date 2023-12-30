/*
 * 環境変数で定めたユーザーのみログインを許可
 * FIXME: Basic認証導入するまでの仮実装
 */
function isMyUser(email) {
  return email === process.env.MY_USER;
}

module.exports = {
  isMyUser,
};
