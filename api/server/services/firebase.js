const firebase = require('firebase/app');
const { getStorage, ref, uploadBytes, getDownloadURL } = require('firebase/storage');

let useFirebase = false;

const firebaseConfigKeys = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID',
];

if (firebaseConfigKeys.every((key) => process.env[key])) {
  const firebaseConfig = Object.fromEntries(
    firebaseConfigKeys.map((key) => [key.replace('FIREBASE_', '').toLowerCase(), process.env[key]]),
  );

  firebaseConfig.storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

  const app = firebase.initializeApp(firebaseConfig);
  const storage = getStorage(app);

  useFirebase = true;
  module.exports = { app, storage, ref, uploadBytes, getDownloadURL, useFirebase };
} else {
  console.warn('Firebase configuration variables are missing. Firebase will not be used.');
  module.exports = { useFirebase };
}
