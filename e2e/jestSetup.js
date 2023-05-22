// Test database. You can use your actual MONGO_URI if you don't mind it potentially including test data.
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/chatgpt-jest';

// Credential encryption/decryption for testing
process.env.CREDS_KEY_PROD = 'c3301ad2f69681295e022fb135e92787afb6ecfeaa012a10f8bb4ddf6b669e6d';
process.env.CREDS_KEY_DEV = 'c3301ad2f69681295e022fb135e92787afb6ecfeaa012a10f8bb4ddf6b669e6d';
process.env.CREDS_IV_PROD = 'cd02538f4be2fa37aba9420b5924389f';
process.env.CREDS_IV_DEV = 'cd02538f4be2fa37aba9420b5924389f';
