// Support for multiple .env files via the ENV_FILE environment variable
// E.g. ENV_FILE=".env.local,.env" to load both .env.local and .env. The first
// value set for a variable will win (e.g. .env.local has priority over .env).
// Fallback to default .env if not specified.
require('dotenv').config({
  path: process.env.ENV_FILE ? process.env.ENV_FILE.split(',') : undefined,
});
