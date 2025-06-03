import { createModels } from '@librechat/data-schemas';

const mongoose = require('mongoose');
const { createMethods } = require('@librechat/data-schemas');
const methods = createMethods(mongoose);

const {
  findSession,
  deleteSession,
  createSession,
  findUser,
  countUsers,
  deleteUserById,
  createUser,
  updateUser,
  createToken,
  findToken,
  deleteTokens,
  generateToken,
  generateRefreshToken,
  getUserById,
} = methods;

export {
  findSession,
  deleteSession,
  createSession,
  findUser,
  countUsers,
  deleteUserById,
  createUser,
  updateUser,
  createToken,
  findToken,
  deleteTokens,
  generateToken,
  generateRefreshToken,
  getUserById,
};
