#!/usr/bin/env node
/**
 * Generates a short-lived JWT identical to what the backend uses for RAG uploads/queries.
 * Usage:
 *   USER_ID=<user-id> node scripts/generate-rag-token.js
 *
 * Outputs the token to stdout. Set RAG_BEARER_TOKEN in your shell with it.
 */

require('dotenv').config();
const { generateShortLivedToken } = require('@librechat/api');

const userId = process.env.USER_ID || process.env.RAG_USER_ID || 'system';

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is required (same as backend/RAG).');
  process.exit(1);
}

const token = generateShortLivedToken(userId);
console.log(token);
