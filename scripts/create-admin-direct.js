#!/usr/bin/env node
require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const argv = process.argv.slice(2);
let email, name, username, password, role;

for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--role=')) {
    role = argv[i].split('=')[1];
    continue;
  }
  if (argv[i] === '--admin') {
    role = 'admin';
    continue;
  }
  if (!email) email = argv[i];
  else if (!name) name = argv[i];
  else if (!username) username = argv[i];
  else if (!password) password = argv[i];
}

if (!email) {
  console.error('Usage: node scripts/create-admin-direct.js <email> <name> <username> [password] [--role=admin]');
  process.exit(1);
}

if (!password) {
  password = crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 18);
  console.log('Generated password:', password);
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/LibreChat';

(async () => {
  const client = new MongoClient(MONGO_URI, { maxPoolSize: 1 });
  try {
    await client.connect();
    const dbName = (new URL(MONGO_URI)).pathname.replace('/', '') || 'LibreChat';
    const db = client.db(dbName);
    const users = db.collection('users');

    const existing = await users.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
    if (existing) {
      console.error('Error: A user with that email or username already exists!');
      process.exit(1);
    }

    const salt = bcrypt.genSaltSync(10);
    const hashed = bcrypt.hashSync(password, salt);

    const now = new Date();
    const userDoc = {
      email: email.toLowerCase(),
      username: username || email.split('@')[0],
      name: name || email.split('@')[0],
      password: hashed,
      provider: 'local',
      role: role || 'admin',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    };

    const res = await users.insertOne(userDoc);
    if (res.acknowledged) {
      console.log('Admin user created successfully!');
      console.log('Email:', userDoc.email);
      console.log('Username:', userDoc.username);
      console.log('Password:', password);
      process.exit(0);
    } else {
      console.error('Failed to create user');
      process.exit(1);
    }
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  } finally {
    try { await client.close(); } catch (e) {}
  }
})();
