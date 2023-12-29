const firebase = require('firebase/app');
const { getStorage } = require('firebase/storage');
const { logger } = require('~/config');

let firebaseApp = null;

const initializeFirebase = () => {
  if (firebaseApp) {
    return firebaseApp;
  } // Return existing instance if already initialized

  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  };

  if (Object.values(firebaseConfig).some((value) => !value)) {
    logger.warn(
      'Firebase configuration is not provided or incomplete. Firebase will not be initialized.',
    );
    return null;
  }

  firebaseApp = firebase.initializeApp(firebaseConfig);
  logger.info('Firebase initialized');
  return firebaseApp;
};

const getFirebaseStorage = () => {
  const app = initializeFirebase();
  return app ? getStorage(app) : null;
};

module.exports = { initializeFirebase, getFirebaseStorage };
