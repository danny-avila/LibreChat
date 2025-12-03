db = db.getSiblingDB('LibreChat');

db.createUser({
  user: process.env.LIBRECHAT_DB_USER || 'librechat_user',
  pwd:  process.env.LIBRECHAT_DB_PASS_URL || 'changeMeNow',
  roles: [{ role: 'readWrite', db: 'LibreChat' }]
});
