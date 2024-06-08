const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const InviteUser = require('./schema/inviteUserSchema');
const logger = require('~/config/winston');

/**
 * @module inviteUser
 * @description This module provides functions to create and get user invites
 */

module.exports = {
  /**
   * @type {InviteUser}
   */
  InviteUser,

  /**
   * @function createInvite
   * @description This function creates a new user invite
   * @param {string} email - The email of the user to invite
   * @returns {Promise<Object>} A promise that resolves to the saved invite document
   * @throws {Error} If there is an error creating the invite
   */
  createInvite: async (email) => {
    try {
      let token = crypto.randomBytes(32).toString('hex');
      const hash = bcrypt.hashSync(token, 10);
      const encodedToken = encodeURIComponent(token);
      const invite = new InviteUser({ email, token: hash, createdAt: Date.now() });
      await invite.save();
      return encodedToken;
    } catch (error) {
      logger.error('[createInvite] Error creating invite', error);
      return { message: 'Error creating invite' };
    }
  },

  /**
   * @function getInvite
   * @description This function retrieves a user invite
   * @param {string} token - The token of the invite to retrieve
   * @returns {Promise<Object>} A promise that resolves to the retrieved invite document
   * @throws {Error} If there is an error retrieving the invite or if the invite does not exist
   */
  getInvite: async (encodedToken) => {
    try {
      const token = decodeURIComponent(encodedToken);
      const hash = bcrypt.hashSync(token, 10);
      const invite = await InviteUser.findOne({ token: hash }).lean().exec();
      if (!invite) {
        throw new Error('Invite not found');
      }
      return invite;
    } catch (error) {
      logger.error('[getInvite] Error getting invite', error);
      return { message: 'Error getting invite' };
    }
  },
};
