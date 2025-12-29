const mongoose = require('mongoose');
const { logger, hashToken, getRandomValues } = require('@librechat/data-schemas');
const { createToken, findToken } = require('~/models');

/**
 * @module inviteUser
 * @description This module provides functions to create and get user invites
 */

/**
 * @function createInvite
 * @description This function creates a new user invite
 * @param {string} email - The email of the user to invite
 * @returns {Promise<Object>} A promise that resolves to the saved invite document
 * @throws {Error} If there is an error creating the invite
 */
const createInvite = async (email) => {
  try {
    const token = await getRandomValues(32);
    const hash = await hashToken(token);
    const encodedToken = encodeURIComponent(token);

    const fakeUserId = new mongoose.Types.ObjectId();

    await createToken({
      userId: fakeUserId,
      email,
      token: hash,
      createdAt: Date.now(),
      expiresIn: 604800,
    });

    return encodedToken;
  } catch (error) {
    logger.error('[createInvite] Error creating invite', error);
    return { message: 'Error creating invite' };
  }
};

/**
 * @function getInvite
 * @description This function retrieves a user invite
 * @param {string} encodedToken - The token of the invite to retrieve
 * @param {string} email - The email of the user to validate
 * @returns {Promise<Object>} A promise that resolves to the retrieved invite document
 * @throws {Error} If there is an error retrieving the invite, if the invite does not exist, or if the email does not match
 */
const getInvite = async (encodedToken, email) => {
  try {
    const token = decodeURIComponent(encodedToken);
    const hash = await hashToken(token);
    const invite = await findToken({ token: hash, email });

    if (!invite) {
      throw new Error('Invite not found or email does not match');
    }

    return invite;
  } catch (error) {
    logger.error('[getInvite] Error getting invite:', error);
    return { error: true, message: error.message };
  }
};

module.exports = {
  createInvite,
  getInvite,
};
